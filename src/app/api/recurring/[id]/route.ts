import { authed, parseBody } from "@/lib/api";
import { recurringUpdateSchema } from "@/schemas";
import { deleteRecurring, setRecurringActive } from "@/server/recurring.service";

export const PATCH = authed<{ id: string }>(async (req, session, { id }) => {
  const { active } = await parseBody(req, recurringUpdateSchema);
  await setRecurringActive(session.accountId, id, active);
  return { ok: true };
});

export const DELETE = authed<{ id: string }>(async (_req, session, { id }) => {
  await deleteRecurring(session.accountId, id);
  return { ok: true };
});
