import { authed, parseQuery } from "@/lib/api";
import { monthQuery } from "@/schemas";
import { listBudgets } from "@/server/budgets.service";

export const GET = authed(async (req, session) => {
  const { month } = parseQuery(req, monthQuery);
  return { month, budgets: await listBudgets(session.accountId, month) };
});
