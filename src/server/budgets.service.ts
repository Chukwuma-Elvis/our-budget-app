import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { monthStart } from "@/lib/dates";

export type BudgetDto = { categoryId: string; amount: string };

export async function listBudgets(accountId: string, month: string): Promise<BudgetDto[]> {
  const rows = await db.budget.findMany({
    where: { accountId, month: monthStart(month), category: { archivedAt: null } },
  });
  return rows.map((b) => ({ categoryId: b.categoryId, amount: b.amount.toFixed(2) }));
}

export async function setBudget(
  accountId: string,
  userId: string,
  categoryId: string,
  month: string,
  amount: string,
) {
  const category = await db.category.findFirst({ where: { id: categoryId, accountId, archivedAt: null } });
  if (!category) throw notFound("Category not found");
  const start = monthStart(month);

  if (Number(amount) <= 0) {
    await db.budget.deleteMany({
      where: { categoryId, month: start, accountId },
    });
    return { categoryId, amount: "0.00" };
  }

  const row = await db.budget.upsert({
    where: { categoryId_month: { categoryId, month: start } },
    create: { accountId, categoryId, month: start, amount: new Prisma.Decimal(amount), updatedBy: userId },
    update: { amount: new Prisma.Decimal(amount), updatedBy: userId },
  });
  return { categoryId: row.categoryId, amount: row.amount.toFixed(2) };
}

export async function deleteBudget(accountId: string, categoryId: string, month: string) {
  await db.budget.deleteMany({
    where: { categoryId, month: monthStart(month), accountId },
  });
}


/** Copies budgets from one month to another for active categories that have no budget in the target month yet. */
export async function copyBudgets(accountId: string, userId: string, from: string, to: string) {
  if (from === to) throw badRequest("Choose two different months");
  const source = await db.budget.findMany({
    where: { accountId, month: monthStart(from), category: { archivedAt: null } },
  });
  if (source.length === 0) throw badRequest("There are no budgets in that month to copy");
  const result = await db.budget.createMany({
    data: source.map((b) => ({
      accountId,
      categoryId: b.categoryId,
      month: monthStart(to),
      amount: b.amount,
      updatedBy: userId,
    })),
    skipDuplicates: true,
  });
  return { copied: result.count, skipped: source.length - result.count };
}
