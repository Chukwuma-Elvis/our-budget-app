import { z } from "zod";
import { authed } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import {
  purchaseShoppingItem,
  unpurchaseShoppingItem,
} from "@/server/shopping.service";
import { db } from "@/lib/db";

function itemId(id: string) {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw badRequest("Invalid shopping item id");
  return parsed.data;
}

export const POST = authed<{ id: string }>(async (_req, session, { id }) => {
  const targetId = itemId(id);
  const existing = await db.shoppingItem.findFirst({
    where: { id: targetId, accountId: session.accountId },
  });
  if (!existing) throw badRequest("Shopping item not found");

  if (existing.purchased) {
    const unpurchased = await unpurchaseShoppingItem(session.accountId, session.userId, targetId);
    return { item: unpurchased, action: "unpurchased" };
  } else {
    const purchased = await purchaseShoppingItem(session.accountId, session.userId, targetId);
    return { item: purchased, action: "purchased" };
  }
});
