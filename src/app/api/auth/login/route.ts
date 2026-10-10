import { open, parseBody } from "@/lib/api";
import { createSession } from "@/lib/session";
import { loginSchema } from "@/schemas";
import { loginWithPassword } from "@/server/accounts.service";

export const POST = open(async (req) => {
  const body = await parseBody(req, loginSchema);
  const user = await loginWithPassword(body.phone, body.password);
  await createSession(user.id);
  return { ok: true };
});
