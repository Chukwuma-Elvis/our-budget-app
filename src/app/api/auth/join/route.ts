import { open, parseBody } from "@/lib/api";
import { createSession } from "@/lib/session";
import { joinSchema } from "@/schemas";
import { inspectInvite, joinWithInvite } from "@/server/accounts.service";

export const GET = open(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return inspectInvite(token);
});

export const POST = open(async (req) => {
  const body = await parseBody(req, joinSchema);
  const user = await joinWithInvite(body);
  await createSession(user.id);
  return { ok: true };
});
