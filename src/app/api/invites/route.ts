import { authed } from "@/lib/api";
import { createInvite } from "@/server/accounts.service";

export const POST = authed(async (_req, session) => {
  return createInvite(session.accountId, session.userId);
});
