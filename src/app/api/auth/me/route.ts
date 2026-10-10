import { authed } from "@/lib/api";
import { db } from "@/lib/db";
import { listMembers, MAX_MEMBERS } from "@/server/accounts.service";
import { listPasskeys } from "@/server/passkeys.service";

export const GET = authed(async (_req, session) => {
  const [members, passkeys, account] = await Promise.all([
    listMembers(session.accountId),
    listPasskeys(session.userId),
    db.account.findUniqueOrThrow({ where: { id: session.accountId } }),
  ]);
  return {
    user: { id: session.userId, displayName: session.displayName },
    account: { id: account.id, name: account.name },
    members,
    canInvite: members.length < MAX_MEMBERS,
    passkeys,
  };
});
