import { open, parseBody } from "@/lib/api";
import { createSession } from "@/lib/session";
import { passkeyVerifySchema } from "@/schemas";
import { verifyLogin } from "@/server/passkeys.service";

export const POST = open(async (req) => {
  const body = await parseBody(req, passkeyVerifySchema);
  const userId = await verifyLogin(body.challengeId, body.response);
  await createSession(userId);
  return { ok: true };
});
