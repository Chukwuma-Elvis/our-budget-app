import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { createResetLink } from "@/server/accounts.service";

const schema = z.object({ userId: z.uuid() });

// Signed-in member generates a reset link for their partner.
export const POST = authed(async (req, session) => {
  const { userId } = await parseBody(req, schema);
  return createResetLink(session.accountId, session.userId, userId);
});
