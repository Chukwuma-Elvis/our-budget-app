import { authed } from "@/lib/api";
import { availableMonths } from "@/server/reports.service";

export const GET = authed(async (_req, session) => {
  return { months: await availableMonths(session.accountId) };
});
