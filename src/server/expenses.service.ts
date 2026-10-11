import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { dateFromString, monthEnd, monthStart, todayLagos, toDateString } from "@/lib/dates";

export type ExpenseDto = {
  id: string;
  itemName: string;
  amount: string;
  spentOn: string;
  note: string | null;
  category: { id: string; name: string; color: string; archived: boolean };
  createdBy: { id: string; displayName: string };
  updatedBy: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
  recurring: boolean;
};

const include = {
  category: { select: { id: true, name: true, color: true, archivedAt: true } },
  creator: { select: { id: true, displayName: true } },
  updater: { select: { id: true, displayName: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof include }>;

function toDto(e: ExpenseRow): ExpenseDto {
  return {
    id: e.id,
    itemName: e.itemName,
    amount: e.amount.toFixed(2),
    spentOn: toDateString(e.spentOn),
    note: e.note,
    category: {
      id: e.category.id,
      name: e.category.name,
      color: e.category.color,
      archived: e.category.archivedAt !== null,
    },
    createdBy: e.creator,
    updatedBy: e.updater,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    recurring: e.recurringId !== null,
  };
}

function snapshot(e: { itemName: string; categoryId: string; amount: Prisma.Decimal; spentOn: Date; note: string | null }) {
  return {
    itemName: e.itemName,
    categoryId: e.categoryId,
    amount: e.amount.toFixed(2),
    spentOn: toDateString(e.spentOn),
    note: e.note,
  };
}

async function assertActiveCategory(accountId: string, categoryId: string) {
  const category = await db.category.findFirst({ where: { id: categoryId, accountId, archivedAt: null } });
  if (!category) throw badRequest("Choose an active category", { categoryId: "Choose an active category" });
}

export async function createExpense(
  accountId: string,
  userId: string,
  input: { itemName: string; categoryId: string; amount: string; spentOn?: string; note?: string },
) {
  await assertActiveCategory(accountId, input.categoryId);
  return db.$transaction(async (tx) => {
    const row = await tx.expense.create({
      data: {
        accountId,
        categoryId: input.categoryId,
        itemName: input.itemName,
        amount: new Prisma.Decimal(input.amount),
        spentOn: dateFromString(input.spentOn ?? todayLagos()),
        note: input.note || null,
        createdBy: userId,
      },
      include,
    });
    await tx.expenseAudit.create({
      data: { accountId, expenseId: row.id, action: "create", actorId: userId, after: snapshot(row) },
    });
    return toDto(row);
  });
}

export async function createExpensesBatch(
  accountId: string,
  userId: string,
  items: Array<{ itemName: string; categoryId: string; amount: string; spentOn?: string; note?: string }>,
) {
  if (items.length === 0) return [];
  const categoryIds = [...new Set(items.map((i) => i.categoryId))];
  const activeCategories = await db.category.findMany({
    where: { id: { in: categoryIds }, accountId, archivedAt: null },
    select: { id: true },
  });
  const activeSet = new Set(activeCategories.map((c) => c.id));
  for (const item of items) {
    if (!activeSet.has(item.categoryId)) {
      throw badRequest("One or more selected categories are invalid or inactive", {
        categoryId: "Choose an active category",
      });
    }
  }

  return db.$transaction(async (tx) => {
    const results: ExpenseDto[] = [];
    for (const item of items) {
      const row = await tx.expense.create({
        data: {
          accountId,
          categoryId: item.categoryId,
          itemName: item.itemName,
          amount: new Prisma.Decimal(item.amount),
          spentOn: dateFromString(item.spentOn ?? todayLagos()),
          note: item.note || null,
          createdBy: userId,
        },
        include,
      });
      await tx.expenseAudit.create({
        data: { accountId, expenseId: row.id, action: "create", actorId: userId, after: snapshot(row) },
      });
      results.push(toDto(row));
    }
    return results;
  });
}

export async function updateExpense(
  accountId: string,
  userId: string,
  id: string,
  input: { itemName?: string; categoryId?: string; amount?: string; spentOn?: string; note?: string | null },
) {
  const existing = await db.expense.findFirst({ where: { id, accountId } });
  if (!existing) throw notFound("Expense not found");
  if (input.categoryId && input.categoryId !== existing.categoryId) {
    await assertActiveCategory(accountId, input.categoryId);
  }
  return db.$transaction(async (tx) => {
    const row = await tx.expense.update({
      where: { id },
      data: {
        itemName: input.itemName,
        categoryId: input.categoryId,
        amount: input.amount ? new Prisma.Decimal(input.amount) : undefined,
        spentOn: input.spentOn ? dateFromString(input.spentOn) : undefined,
        note: input.note === undefined ? undefined : input.note || null,
        updatedBy: userId,
      },
      include,
    });
    await tx.expenseAudit.create({
      data: {
        accountId,
        expenseId: id,
        action: "update",
        actorId: userId,
        before: snapshot(existing),
        after: snapshot(row),
      },
    });
    return toDto(row);
  });
}

export async function deleteExpense(accountId: string, userId: string, id: string) {
  const existing = await db.expense.findFirst({ where: { id, accountId } });
  if (!existing) throw notFound("Expense not found");
  await db.$transaction([
    db.expense.delete({ where: { id } }),
    db.expenseAudit.create({
      data: { accountId, expenseId: id, action: "delete", actorId: userId, before: snapshot(existing) },
    }),
  ]);
}

export type ExpenseFilter = {
  month?: string;
  categoryId?: string;
  userId?: string;
  q?: string;
};

function buildWhere(accountId: string, f: ExpenseFilter): Prisma.ExpenseWhereInput {
  return {
    accountId,
    ...(f.month ? { spentOn: { gte: monthStart(f.month), lt: monthEnd(f.month) } } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.userId ? { createdBy: f.userId } : {}),
    ...(f.q ? { itemName: { contains: f.q, mode: "insensitive" } } : {}),
  };
}

const ORDER: Prisma.ExpenseOrderByWithRelationInput[] = [{ spentOn: "desc" }, { createdAt: "desc" }];

/** The ledger: every expense with its category and the person who added it. */
export async function listExpenses(accountId: string, f: ExpenseFilter, page: number, pageSize: number) {
  const where = buildWhere(accountId, f);
  const [rows, total, sum] = await Promise.all([
    db.expense.findMany({ where, include, orderBy: ORDER, skip: (page - 1) * pageSize, take: pageSize }),
    db.expense.count({ where }),
    db.expense.aggregate({ where, _sum: { amount: true } }),
  ]);
  return {
    items: rows.map(toDto),
    total,
    page,
    pageSize,
    totalAmount: (sum._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
  };
}

export async function allExpensesForExport(accountId: string, f: ExpenseFilter) {
  const rows = await db.expense.findMany({ where: buildWhere(accountId, f), include, orderBy: ORDER });
  return rows.map(toDto);
}

export async function listAudit(accountId: string, limit = 50) {
  const rows = await db.expenseAudit.findMany({
    where: { accountId },
    orderBy: { at: "desc" },
    take: limit,
    include: { actor: { select: { displayName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    expenseId: r.expenseId,
    action: r.action,
    actor: r.actor?.displayName ?? "Unknown",
    before: r.before,
    after: r.after,
    at: r.at.toISOString(),
  }));
}
