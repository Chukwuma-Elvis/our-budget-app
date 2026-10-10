import { authed, parseBody } from "@/lib/api";
import { changePasswordSchema } from "@/schemas";
import { changePassword } from "@/server/accounts.service";

export const POST = authed(async (req, session) => {
  const body = await parseBody(req, changePasswordSchema);
  await changePassword(session.userId, body.currentPassword, body.newPassword);
  return { ok: true };
});
