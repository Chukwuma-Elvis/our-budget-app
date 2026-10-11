import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";

export const STARTER_CATEGORIES: { name: string; color: string }[] = [
  { name: "Food & Groceries", color: "#16a34a" },
  { name: "Transport", color: "#2563eb" },
  { name: "Rent", color: "#9333ea" },
  { name: "Utilities", color: "#ca8a04" },
  { name: "Airtime & Data", color: "#0891b2" },
  { name: "Health", color: "#dc2626" },
  { name: "Family & Support", color: "#db2777" },
  { name: "Savings", color: "#0d9488" },
  { name: "Miscellaneous", color: "#64748b" },
];

const PALETTE = ["#16a34a", "#2563eb", "#9333ea", "#ca8a04", "#0891b2", "#dc2626", "#db2777", "#0d9488", "#ea580c", "#4f46e5"];

export type CategoryDto = { id: string; name: string; color: string; archived: boolean };

type CategoryRow = { id: string; name: string; color: string; archivedAt: Date | null };

export function toCategoryDto(c: CategoryRow): CategoryDto {
  return { id: c.id, name: c.name, color: c.color, archived: c.archivedAt !== null };
}

export async function listCategories(accountId: string, includeArchived = false): Promise<CategoryDto[]> {
  const rows = await db.category.findMany({
    where: { accountId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });
  return rows.map(toCategoryDto);
}

function isUniqueError(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function createCategory(accountId: string, userId: string, input: { name: string; color?: string }) {
  const existing = await db.category.findFirst({
    where: { accountId, archivedAt: null, name: { equals: input.name, mode: "insensitive" } },
  });
  if (existing) throw conflict(`You already have a category called "${existing.name}"`);
  const count = await db.category.count({ where: { accountId } });
  try {
    const row = await db.category.create({
      data: { accountId, name: input.name, color: input.color ?? PALETTE[count % PALETTE.length], createdBy: userId },
    });
    return toCategoryDto(row);
  } catch (err) {
    if (isUniqueError(err)) throw conflict("You already have a category with that name");
    throw err;
  }
}

export async function updateCategory(
  accountId: string,
  id: string,
  input: { name?: string; color?: string },
) {
  const category = await db.category.findFirst({ where: { id, accountId, archivedAt: null } });
  if (!category) throw notFound("Category not found");
  if (input.name) {
    const clash = await db.category.findFirst({
      where: { accountId, archivedAt: null, id: { not: id }, name: { equals: input.name, mode: "insensitive" } },
    });
    if (clash) throw conflict(`You already have a category called "${clash.name}"`);
  }
  const row = await db.category.update({ where: { id }, data: input });
  return toCategoryDto(row);
}

/** Removing a category archives it, so past expenses keep working, but clears its budgets so it never adds to total budget. */
export async function archiveCategory(accountId: string, id: string) {
  const category = await db.category.findFirst({ where: { id, accountId, archivedAt: null } });
  if (!category) throw notFound("Category not found");
  await db.$transaction([
    db.category.update({ where: { id }, data: { archivedAt: new Date() } }),
    db.budget.deleteMany({ where: { categoryId: id, accountId } }),
  ]);
}

/** Adds the suggested categories that do not exist yet. Returns how many were created. */
export async function addStarterCategories(accountId: string, userId: string): Promise<number> {
  const existing = await db.category.findMany({
    where: { accountId, archivedAt: null },
    select: { name: true },
  });
  const have = new Set(existing.map((c) => c.name.toLowerCase()));
  const toCreate = STARTER_CATEGORIES.filter((c) => !have.has(c.name.toLowerCase()));
  if (toCreate.length === 0) return 0;
  await db.category.createMany({
    data: toCreate.map((c) => ({ accountId, name: c.name, color: c.color, createdBy: userId })),
  });
  return toCreate.length;
}
