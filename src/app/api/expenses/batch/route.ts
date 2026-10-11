import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/api";
import { expenseBatchSchema } from "@/schemas";
import { createExpensesBatch } from "@/server/expenses.service";

export const POST = authed(async (req, session) => {
  const body = await parseBody(req, expenseBatchSchema);
  const created = await createExpensesBatch(session.accountId, session.userId, body.items);
  return NextResponse.json({ count: created.length, items: created }, { status: 201 });
});
