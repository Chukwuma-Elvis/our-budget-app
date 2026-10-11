import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addMonths, currentMonthKey, monthEnd, monthStart } from "@/lib/dates";
import { percentUsed, spendStatus, type SpendStatus } from "@/lib/status";

const ZERO = new Prisma.Decimal(0);

export type SummaryRow = {
  categoryId: string;
  name: string;
  color: string;
  archived: boolean;
  budget: string;
  spent: string;
  remaining: string;
  percent: number;
  status: SpendStatus;
  overdrawn: boolean;
};

export async function monthSummary(accountId: string, month: string) {
  const start = monthStart(month);
  const end = monthEnd(month);

  const [budgets, spentGroups] = await Promise.all([
    db.budget.findMany({
      where: { accountId, month: start, category: { archivedAt: null } },
    }),
    db.expense.groupBy({
      by: ["categoryId"],
      where: { accountId, spentOn: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
  ]);

  const budgetBy = new Map(budgets.map((b) => [b.categoryId, b.amount]));
  const spentBy = new Map(spentGroups.map((g) => [g.categoryId, g._sum.amount ?? ZERO]));

  const spentCategoryIds = [...spentBy.entries()]
    .filter(([_, amount]) => !amount.isZero())
    .map(([id]) => id);

  const categories = await db.category.findMany({
    where: {
      accountId,
      OR: [{ archivedAt: null }, { id: { in: spentCategoryIds } }],
    },
    orderBy: { name: "asc" },
  });

  let totalBudget = ZERO;
  let totalSpent = ZERO;
  const rows: SummaryRow[] = [];

  for (const c of categories) {
    const isArchived = c.archivedAt !== null;
    const spent = spentBy.get(c.id) ?? ZERO;

    // A category removed for or before this month must never add to total budget.
    const budget = isArchived ? ZERO : (budgetBy.get(c.id) ?? ZERO);

    // If an archived category had no spend in this month, remove it completely.
    if (isArchived && spent.isZero()) continue;

    totalBudget = totalBudget.add(budget);
    totalSpent = totalSpent.add(spent);
    const status = spendStatus(spent.toNumber(), budget.toNumber());

    rows.push({
      categoryId: c.id,
      name: c.name,
      color: c.color,
      archived: isArchived,
      budget: budget.toFixed(2),
      spent: spent.toFixed(2),
      remaining: budget.sub(spent).toFixed(2),
      percent: percentUsed(spent.toNumber(), budget.toNumber()),
      status,
      overdrawn: status === "overdrawn",
    });
  }

  const totalStatus = spendStatus(totalSpent.toNumber(), totalBudget.toNumber());
  return {
    month,
    categories: rows,
    totals: {
      budget: totalBudget.toFixed(2),
      spent: totalSpent.toFixed(2),
      remaining: totalBudget.sub(totalSpent).toFixed(2),
      percent: percentUsed(totalSpent.toNumber(), totalBudget.toNumber()),
      status: totalStatus,
      overdrawn: totalStatus === "overdrawn",
    },
  };
}

export type MonthlyRow = { month: string; spent: string; budgeted: string; count: number };

export async function monthlyTotals(accountId: string, from?: string, to?: string): Promise<MonthlyRow[]> {
  const lower = from ? monthStart(from) : new Date("1900-01-01T00:00:00Z");
  const upper = to ? monthEnd(to) : new Date("2999-01-01T00:00:00Z");

  const [spent, budgeted] = await Promise.all([
    db.$queryRaw<{ month: string; total: Prisma.Decimal; count: number }[]>`
      SELECT to_char(spent_on, 'YYYY-MM') AS month, SUM(amount) AS total, COUNT(*)::int AS count
      FROM expenses
      WHERE account_id = ${accountId}::uuid AND spent_on >= ${lower}::date AND spent_on < ${upper}::date
      GROUP BY 1`,
    db.$queryRaw<{ month: string; total: Prisma.Decimal }[]>`
      SELECT to_char(b.month, 'YYYY-MM') AS month, SUM(b.amount) AS total
      FROM budgets b
      JOIN categories c ON c.id = b.category_id
      WHERE b.account_id = ${accountId}::uuid
        AND c.archived_at IS NULL
        AND b.month >= ${lower}::date
        AND b.month < ${upper}::date
      GROUP BY 1`,
  ]);

  const map = new Map<string, MonthlyRow>();
  for (const s of spent) {
    map.set(s.month, { month: s.month, spent: new Prisma.Decimal(s.total).toFixed(2), budgeted: "0.00", count: s.count });
  }
  for (const b of budgeted) {
    const row = map.get(b.month) ?? { month: b.month, spent: "0.00", budgeted: "0.00", count: 0 };
    row.budgeted = new Prisma.Decimal(b.total).toFixed(2);
    map.set(b.month, row);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export async function spendByUser(accountId: string, month: string) {
  const [groups, members] = await Promise.all([
    db.expense.groupBy({
      by: ["createdBy"],
      where: { accountId, spentOn: { gte: monthStart(month), lt: monthEnd(month) } },
      _sum: { amount: true },
      _count: true,
    }),
    db.user.findMany({ where: { accountId }, select: { id: true, displayName: true } }),
  ]);
  const byId = new Map(groups.map((g) => [g.createdBy, g]));
  return members.map((m) => {
    const g = byId.get(m.id);
    return {
      userId: m.id,
      displayName: m.displayName,
      spent: (g?._sum.amount ?? ZERO).toFixed(2),
      count: g?._count ?? 0,
    };
  });
}

/** Months that have any budget or expense, newest first. Always includes current month and next month for planning ahead. */
export async function availableMonths(accountId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ month: string }[]>`
    SELECT to_char(e.spent_on, 'YYYY-MM') AS month FROM expenses e WHERE e.account_id = ${accountId}::uuid
    UNION
    SELECT to_char(b.month, 'YYYY-MM') AS month
    FROM budgets b
    JOIN categories c ON c.id = b.category_id
    WHERE b.account_id = ${accountId}::uuid AND c.archived_at IS NULL`;
  const set = new Set(rows.map((r) => r.month));
  const current = currentMonthKey();
  set.add(current);
  set.add(addMonths(current, 1));
  return [...set].sort().reverse();
}

