import { authed, parseBody } from "@/lib/api";
import { categoryUpdateSchema } from "@/schemas";
import { archiveCategory, updateCategory } from "@/server/categories.service";

export const PATCH = authed<{ id: string }>(async (req, session, { id }) => {
  const body = await parseBody(req, categoryUpdateSchema);
  return updateCategory(session.accountId, id, body);
});

export const DELETE = authed<{ id: string }>(async (_req, session, { id }) => {
  await archiveCategory(session.accountId, id);
  return { ok: true };
});
