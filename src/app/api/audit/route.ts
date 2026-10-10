import { authed } from "@/lib/api";
import { listAudit } from "@/server/expenses.service";

export const GET = authed(async (_req, session) => {
  return { entries: await listAudit(session.accountId, 100) };
});
