import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { shoppingItemUpdateSchema } from "@/schemas";
import { deleteShoppingItem, updateShoppingItem } from "@/server/shopping.service";

function itemId(id: string) {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw badRequest("Invalid shopping item id");
  return parsed.data;
}

export const PATCH = authed<{ id: string }>(async (req, session, { id }) => {
  const body = await parseBody(req, shoppingItemUpdateSchema);
  return updateShoppingItem(session.accountId, session.userId, itemId(id), body);
});

export const DELETE = authed<{ id: string }>(async (_req, session, { id }) => {
  await deleteShoppingItem(session.accountId, itemId(id));
  return { ok: true };
});
