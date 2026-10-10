import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { advanceDate, dateFromString, todayLagos, toDateString } from "@/lib/dates";

type Frequency = "weekly" | "monthly" | "yearly";

export async function listRecurring(accountId: string) {
  const rows = await db.recurringExpense.findMany({
    where: { accountId },
    orderBy: [{ active: "desc" }, { nextRunOn: "asc" }],
    include: { category: { select: { name: true, color: true } }, creator: { select: { displayName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    itemName: r.itemName,
    amount: r.amount.toFixed(2),
    frequency: r.frequency as Frequency,
    nextRunOn: toDateString(r.nextRunOn),
    active: r.active,
    category: r.category,
    createdBy: r.creator.displayName,
  }));
}

export async function createRecurring(
  accountId: string,
  userId: string,
  input: { itemName: string; categoryId: string; amount: string; frequency: Frequency; startsOn: string },
) {
  const category = await db.category.findFirst({ where: { id: input.categoryId, accountId, archivedAt: null } });
  if (!category) throw badRequest("Choose an active category");
  const row = await db.recurringExpense.create({
    data: {
      accountId,
      categoryId: input.categoryId,
      itemName: input.itemName,
      amount: new Prisma.Decimal(input.amount),
      frequency: input.frequency,
      nextRunOn: dateFromString(input.startsOn),
      createdBy: userId,
    },
  });
  return { id: row.id };
}

export async function setRecurringActive(accountId: string, id: string, active: boolean) {
  const result = await db.recurringExpense.updateMany({ where: { id, accountId }, data: { active } });
  if (result.count === 0) throw notFound("Recurring item not found");
}

export async function deleteRecurring(accountId: string, id: string) {
  const result = await db.recurringExpense.deleteMany({ where: { id, accountId } });
  if (result.count === 0) throw notFound("Recurring item not found");
}

/**
 * Creates an expense for every occurrence that is due on or before today, catching up on
 * any days the daily job missed. Safe to run more than once a day.
 */
export async function runDueRecurring(): Promise<{ created: number }> {
  const today = todayLagos();
  const due = await db.recurringExpense.findMany({
    where: { active: true, nextRunOn: { lte: dateFromString(today) } },
  });

  let created = 0;
  for (const item of due) {
    await db.$transaction(async (tx) => {
      // Re-read inside the transaction so a concurrent run does not double-create.
      const fresh = await tx.recurringExpense.findUnique({ where: { id: item.id } });
      if (!fresh || !fresh.active) return;
      let next = toDateString(fresh.nextRunOn);
      let guard = 0;
      while (next <= today && guard++ < 400) {
        const expense = await tx.expense.create({
          data: {
            accountId: fresh.accountId,
            categoryId: fresh.categoryId,
            itemName: fresh.itemName,
            amount: fresh.amount,
            spentOn: dateFromString(next),
            note: "Recurring",
            createdBy: fresh.createdBy,
            recurringId: fresh.id,
          },
        });
        await tx.expenseAudit.create({
          data: {
            accountId: fresh.accountId,
            expenseId: expense.id,
            action: "create",
            actorId: fresh.createdBy,
            after: { itemName: fresh.itemName, amount: fresh.amount.toFixed(2), spentOn: next, recurring: true },
          },
        });
        created += 1;
        next = advanceDate(next, fresh.frequency as Frequency);
      }
      await tx.recurringExpense.update({ where: { id: fresh.id }, data: { nextRunOn: dateFromString(next) } });
    });
  }
  return { created };
}
