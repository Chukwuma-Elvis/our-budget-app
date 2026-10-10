import { authed, parseQuery } from "@/lib/api";
import { monthQuery } from "@/schemas";
import { spendByUser } from "@/server/reports.service";

export const GET = authed(async (req, session) => {
  const { month } = parseQuery(req, monthQuery);
  return { month, users: await spendByUser(session.accountId, month) };
});
