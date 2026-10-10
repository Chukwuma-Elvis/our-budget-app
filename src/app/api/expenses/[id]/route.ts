import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { expenseUpdateSchema } from "@/schemas";
import { deleteExpense, updateExpense } from "@/server/expenses.service";

function expenseId(id: string) {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw badRequest("Invalid expense id");
  return parsed.data;
}

export const PATCH = authed<{ id: string }>(async (req, session, { id }) => {
  const body = await parseBody(req, expenseUpdateSchema);
  return updateExpense(session.accountId, session.userId, expenseId(id), body);
});

export const DELETE = authed<{ id: string }>(async (_req, session, { id }) => {
  await deleteExpense(session.accountId, session.userId, expenseId(id));
  return { ok: true };
});
