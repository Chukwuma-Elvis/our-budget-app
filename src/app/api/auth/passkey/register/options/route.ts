import { authed } from "@/lib/api";
import { registrationOptions } from "@/server/passkeys.service";

export const POST = authed(async (_req, session) => registrationOptions(session.userId));
