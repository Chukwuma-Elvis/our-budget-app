import { open, parseBody } from "@/lib/api";
import { createSession } from "@/lib/session";
import { resetPasswordSchema } from "@/schemas";
import { resetPassword } from "@/server/accounts.service";

export const POST = open(async (req) => {
  const body = await parseBody(req, resetPasswordSchema);
  const userId = await resetPassword(body.token, body.newPassword);
  await createSession(userId);
  return { ok: true };
});
