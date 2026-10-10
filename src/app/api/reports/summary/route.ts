import { authed, parseQuery } from "@/lib/api";
import { monthQuery } from "@/schemas";
import { monthSummary } from "@/server/reports.service";

export const GET = authed(async (req, session) => {
  const { month } = parseQuery(req, monthQuery);
  return monthSummary(session.accountId, month);
});
