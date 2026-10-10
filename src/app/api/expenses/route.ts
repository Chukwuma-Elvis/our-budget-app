import { NextResponse } from "next/server";
import { authed, parseBody, parseQuery } from "@/lib/api";
import { expenseCreateSchema, expenseListQuery } from "@/schemas";
import { createExpense, listExpenses } from "@/server/expenses.service";

export const GET = authed(async (req, session) => {
  const { page, pageSize, ...filter } = parseQuery(req, expenseListQuery);
  return listExpenses(session.accountId, filter, page, pageSize);
});

export const POST = authed(async (req, session) => {
  const body = await parseBody(req, expenseCreateSchema);
  const expense = await createExpense(session.accountId, session.userId, body);
  return NextResponse.json(expense, { status: 201 });
});
