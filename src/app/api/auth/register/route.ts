import { open, parseBody } from "@/lib/api";
import { createSession } from "@/lib/session";
import { registerSchema } from "@/schemas";
import { registerFirstUser } from "@/server/accounts.service";

export const POST = open(async (req) => {
  const body = await parseBody(req, registerSchema);
  const clientKey = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const user = await registerFirstUser(body, clientKey);
  await createSession(user.id);
  return { ok: true };
});
