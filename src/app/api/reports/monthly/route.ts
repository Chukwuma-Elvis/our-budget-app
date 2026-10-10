import { authed, parseQuery } from "@/lib/api";
import { monthlyQuery } from "@/schemas";
import { monthlyTotals } from "@/server/reports.service";

export const GET = authed(async (req, session) => {
  const { from, to } = parseQuery(req, monthlyQuery);
  return { months: await monthlyTotals(session.accountId, from, to) };
});
