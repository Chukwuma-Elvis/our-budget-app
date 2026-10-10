import { authed } from "@/lib/api";
import { deletePasskey } from "@/server/passkeys.service";

export const DELETE = authed<{ id: string }>(async (_req, session, { id }) => {
  await deletePasskey(session.userId, id);
  return { ok: true };
});
