import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { addMonths, currentMonthKey, monthEnd, monthStart, todayLagos } from "@/lib/dates";
import { createExpense, deleteExpense } from "./expenses.service";

export type ShoppingItemDto = {
  id: string;
  itemName: string;
  quantity: string;
  unitPrice: string | null;
  amount: string;
  categoryId: string;
  category: { id: string; name: string; color: string; archived: boolean };
  purchased: boolean;
  purchasedAt: string | null;
  expenseId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

const includeCategory = {
  category: { select: { id: true, name: true, color: true, archivedAt: true } },
} satisfies Prisma.ShoppingItemInclude;

type ShoppingItemRow = Prisma.ShoppingItemGetPayload<{ include: typeof includeCategory }>;

function toDto(item: ShoppingItemRow): ShoppingItemDto {
  return {
    id: item.id,
    itemName: item.itemName,
    quantity: item.quantity,
    unitPrice: item.unitPrice ? item.unitPrice.toFixed(2) : null,
    amount: item.amount.toFixed(2),
    categoryId: item.categoryId,
    category: {
      id: item.category.id,
      name: item.category.name,
      color: item.category.color,
      archived: item.category.archivedAt !== null,
    },
    purchased: item.purchased,
    purchasedAt: item.purchasedAt ? item.purchasedAt.toISOString() : null,
    expenseId: item.expenseId,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function assertActiveCategory(accountId: string, categoryId: string) {
  const category = await db.category.findFirst({ where: { id: categoryId, accountId, archivedAt: null } });
  if (!category) throw badRequest("Choose an active category", { categoryId: "Choose an active category" });
  return category;
}

export async function listShoppingItems(accountId: string): Promise<ShoppingItemDto[]> {
  const rows = await db.shoppingItem.findMany({
    where: { accountId },
    include: includeCategory,
    orderBy: [
      { purchased: "asc" },
      { sortOrder: "asc" },
      { createdAt: "desc" },
    ],
  });
  return rows.map(toDto);
}

export async function createShoppingItem(
  accountId: string,
  userId: string,
  input: {
    itemName: string;
    categoryId: string;
    quantity?: string;
    unitPrice?: string | null;
    amount: string;
  },
): Promise<ShoppingItemDto> {
  await assertActiveCategory(accountId, input.categoryId);

  const maxOrder = await db.shoppingItem.findFirst({
    where: { accountId, purchased: false },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const row = await db.shoppingItem.create({
    data: {
      accountId,
      itemName: input.itemName.trim(),
      quantity: input.quantity?.trim() || "1",
      unitPrice: input.unitPrice ? new Prisma.Decimal(input.unitPrice) : null,
      amount: new Prisma.Decimal(input.amount),
      categoryId: input.categoryId,
      createdBy: userId,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
    include: includeCategory,
  });

  return toDto(row);
}

export async function updateShoppingItem(
  accountId: string,
  userId: string,
  id: string,
  input: {
    itemName?: string;
    categoryId?: string;
    quantity?: string;
    unitPrice?: string | null;
    amount?: string;
    purchased?: boolean;
    sortOrder?: number;
  },
): Promise<ShoppingItemDto> {
  const existing = await db.shoppingItem.findFirst({ where: { id, accountId }, include: includeCategory });
  if (!existing) throw notFound("Shopping item not found");

  if (input.categoryId && input.categoryId !== existing.categoryId) {
    await assertActiveCategory(accountId, input.categoryId);
  }

  // If toggling purchased state:
  if (input.purchased !== undefined && input.purchased !== existing.purchased) {
    if (input.purchased) {
      return purchaseShoppingItem(accountId, userId, id);
    } else {
      return unpurchaseShoppingItem(accountId, userId, id);
    }
  }

  const updated = await db.shoppingItem.update({
    where: { id },
    data: {
      itemName: input.itemName !== undefined ? input.itemName.trim() : existing.itemName,
      categoryId: input.categoryId ?? existing.categoryId,
      quantity: input.quantity !== undefined ? input.quantity.trim() : existing.quantity,
      unitPrice: input.unitPrice !== undefined
        ? (input.unitPrice ? new Prisma.Decimal(input.unitPrice) : null)
        : existing.unitPrice,
      amount: input.amount ? new Prisma.Decimal(input.amount) : existing.amount,
      sortOrder: input.sortOrder !== undefined ? input.sortOrder : existing.sortOrder,
    },
    include: includeCategory,
  });

  // If already purchased and linked to an expense, keep expense in sync with updated amount/name
  if (updated.expenseId && (input.amount || input.itemName || input.categoryId)) {
    try {
      await db.expense.update({
        where: { id: updated.expenseId },
        data: {
          itemName: updated.itemName,
          amount: updated.amount,
          categoryId: updated.categoryId,
        },
      });
    } catch {
      // ignore if expense was altered
    }
  }

  return toDto(updated);
}

export async function deleteShoppingItem(accountId: string, id: string): Promise<{ deleted: boolean }> {
  const existing = await db.shoppingItem.findFirst({ where: { id, accountId } });
  if (!existing) throw notFound("Shopping item not found");
  await db.shoppingItem.delete({ where: { id } });
  return { deleted: true };
}

export async function purchaseShoppingItem(
  accountId: string,
  userId: string,
  id: string,
): Promise<ShoppingItemDto> {
  const existing = await db.shoppingItem.findFirst({ where: { id, accountId }, include: includeCategory });
  if (!existing) throw notFound("Shopping item not found");

  // If already purchased and has linked expense, return immediately
  if (existing.purchased && existing.expenseId) {
    return toDto(existing);
  }

  // Note formatting
  const qtyPart = existing.quantity && existing.quantity !== "1" ? `Qty: ${existing.quantity}` : "";
  const unitPart = existing.unitPrice ? `@ ₦${existing.unitPrice.toFixed(2)}` : "";
  const noteDetails = [qtyPart, unitPart].filter(Boolean).join(" ");
  const note = noteDetails ? `Shopping list (${noteDetails})` : "Shopping list item";

  // Automatically create expense in ledger
  const expense = await createExpense(accountId, userId, {
    itemName: existing.itemName,
    categoryId: existing.categoryId,
    amount: existing.amount.toFixed(2),
    spentOn: todayLagos(),
    note,
  });

  const updated = await db.shoppingItem.update({
    where: { id },
    data: {
      purchased: true,
      purchasedAt: new Date(),
      expenseId: expense.id,
    },
    include: includeCategory,
  });

  return toDto(updated);
}

export async function unpurchaseShoppingItem(
  accountId: string,
  userId: string,
  id: string,
): Promise<ShoppingItemDto> {
  const existing = await db.shoppingItem.findFirst({ where: { id, accountId }, include: includeCategory });
  if (!existing) throw notFound("Shopping item not found");

  if (!existing.purchased) {
    return toDto(existing);
  }

  // If linked to an expense, remove that expense from ledger
  if (existing.expenseId) {
    try {
      await deleteExpense(accountId, userId, existing.expenseId);
    } catch {
      // ignore if already deleted
    }
  }

  const updated = await db.shoppingItem.update({
    where: { id },
    data: {
      purchased: false,
      purchasedAt: null,
      expenseId: null,
    },
    include: includeCategory,
  });

  return toDto(updated);
}

export async function clearPurchasedItems(accountId: string): Promise<{ deletedCount: number }> {
  const res = await db.shoppingItem.deleteMany({
    where: { accountId, purchased: true },
  });
  return { deletedCount: res.count };
}

export async function importPreviousMonthFoodItems(
  accountId: string,
  userId: string,
  options?: { month?: string; categoryId?: string },
): Promise<{ count: number; items: ShoppingItemDto[]; sourceMonth: string }> {
  const targetMonth = options?.month || addMonths(currentMonthKey(), -1);
  const fromDate = monthStart(targetMonth);
  const toDate = monthEnd(targetMonth);

  // Active categories in the account for fallback / lookup
  const activeCategories = await db.category.findMany({
    where: { accountId, archivedAt: null },
  });
  if (activeCategories.length === 0) {
    throw badRequest("No active categories found in account");
  }

  let targetCategoryIds: string[] = [];

  if (options?.categoryId) {
    targetCategoryIds = [options.categoryId];
  } else {
    // Look for categories with "food", "market", or "grocer"
    const matching = activeCategories.filter((c) => {
      const name = c.name.toLowerCase();
      return name.includes("food") || name.includes("market") || name.includes("grocer");
    });

    if (matching.length > 0) {
      targetCategoryIds = matching.map((c) => c.id);
    } else {
      // Fallback: search across all active categories in target month
      targetCategoryIds = activeCategories.map((c) => c.id);
    }
  }

  // Fetch expenses from target month matching categories
  const expenses = await db.expense.findMany({
    where: {
      accountId,
      spentOn: { gte: fromDate, lt: toDate },
      categoryId: { in: targetCategoryIds },
    },
    orderBy: { spentOn: "desc" },
    include: { category: true },
  });

  if (expenses.length === 0) {
    return { count: 0, items: [], sourceMonth: targetMonth };
  }

  // Fetch unpurchased existing shopping items to avoid adding duplicate items
  const existingItems = await db.shoppingItem.findMany({
    where: { accountId, purchased: false },
    select: { itemName: true },
  });
  const existingNames = new Set(existingItems.map((i) => i.itemName.trim().toLowerCase()));

  // Deduplicate expenses by item name (keep most recent)
  const uniqueExpensesMap = new Map<string, typeof expenses[0]>();
  for (const exp of expenses) {
    const key = exp.itemName.trim().toLowerCase();
    if (!existingNames.has(key) && !uniqueExpensesMap.has(key)) {
      uniqueExpensesMap.set(key, exp);
    }
  }

  const itemsToCreate = Array.from(uniqueExpensesMap.values());
  if (itemsToCreate.length === 0) {
    return { count: 0, items: [], sourceMonth: targetMonth };
  }

  // Parse quantity and unit price from note if available, else default
  const createdList: ShoppingItemDto[] = [];
  const maxOrder = await db.shoppingItem.findFirst({
    where: { accountId, purchased: false },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let nextOrder = (maxOrder?.sortOrder ?? -1) + 1;

  for (const exp of itemsToCreate) {
    // If the category was archived, map to the first active matching category or first active category
    let validCategoryId = exp.categoryId;
    if (!activeCategories.some((c) => c.id === validCategoryId)) {
      const fallbackCat = activeCategories.find((c) =>
        c.name.toLowerCase().includes("food") || c.name.toLowerCase().includes("market"),
      ) ?? activeCategories[0];
      validCategoryId = fallbackCat.id;
    }

    // Try to extract quantity and unit price from note (e.g. "Qty: 2 @ ₦500.00")
    let quantity = "1";
    let unitPrice: Prisma.Decimal | null = null;
    if (exp.note) {
      const qtyMatch = exp.note.match(/(?:qty|quantity):\s*([0-9]+(?:\.[0-9]+)?(?:\s*[a-zA-Z]+)?)/i);
      if (qtyMatch) {
        quantity = qtyMatch[1].trim();
      }
    }

    const numericQty = parseFloat(quantity);
    if (!isNaN(numericQty) && numericQty > 1) {
      unitPrice = new Prisma.Decimal(exp.amount.toNumber() / numericQty);
    } else {
      unitPrice = exp.amount;
    }

    const row = await db.shoppingItem.create({
      data: {
        accountId,
        itemName: exp.itemName.trim(),
        quantity,
        unitPrice,
        amount: exp.amount,
        categoryId: validCategoryId,
        createdBy: userId,
        sortOrder: nextOrder++,
      },
      include: includeCategory,
    });

    createdList.push(toDto(row));
  }

  return {
    count: createdList.length,
    items: createdList,
    sourceMonth: targetMonth,
  };
}
