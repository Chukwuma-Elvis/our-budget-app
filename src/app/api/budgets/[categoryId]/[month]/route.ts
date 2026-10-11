import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { budgetSetSchema, monthSchema } from "@/schemas";
import { deleteBudget, setBudget } from "@/server/budgets.service";

export const PUT = authed<{ categoryId: string; month: string }>(async (req, session, params) => {
  const categoryId = z.uuid().safeParse(params.categoryId);
  const month = monthSchema.safeParse(params.month);
  if (!categoryId.success || !month.success) throw badRequest("Invalid category or month");
  const { amount } = await parseBody(req, budgetSetSchema);
  return setBudget(session.accountId, session.userId, categoryId.data, month.data, amount);
});

export const DELETE = authed<{ categoryId: string; month: string }>(async (_req, session, params) => {
  const categoryId = z.uuid().safeParse(params.categoryId);
  const month = monthSchema.safeParse(params.month);
  if (!categoryId.success || !month.success) throw badRequest("Invalid category or month");
  await deleteBudget(session.accountId, categoryId.data, month.data);
  return { ok: true };
});

