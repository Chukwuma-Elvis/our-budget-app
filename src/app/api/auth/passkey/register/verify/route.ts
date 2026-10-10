import { authed, parseBody } from "@/lib/api";
import { passkeyVerifySchema } from "@/schemas";
import { verifyRegistration } from "@/server/passkeys.service";

export const POST = authed(async (req, session) => {
  const body = await parseBody(req, passkeyVerifySchema);
  await verifyRegistration(session.userId, body.challengeId, body.response, body.deviceLabel);
  return { ok: true };
});
