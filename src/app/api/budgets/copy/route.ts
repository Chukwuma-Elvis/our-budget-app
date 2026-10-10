import { authed, parseBody } from "@/lib/api";
import { budgetCopySchema } from "@/schemas";
import { copyBudgets } from "@/server/budgets.service";

export const POST = authed(async (req, session) => {
  const { from, to } = await parseBody(req, budgetCopySchema);
  return copyBudgets(session.accountId, session.userId, from, to);
});
