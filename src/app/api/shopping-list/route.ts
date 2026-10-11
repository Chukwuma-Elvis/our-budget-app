import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/api";
import { shoppingItemCreateSchema } from "@/schemas";
import {
  clearPurchasedItems,
  createShoppingItem,
  listShoppingItems,
} from "@/server/shopping.service";

export const GET = authed(async (_req, session) => {
  const items = await listShoppingItems(session.accountId);
  return { items };
});

export const POST = authed(async (req, session) => {
  const body = await parseBody(req, shoppingItemCreateSchema);
  const item = await createShoppingItem(session.accountId, session.userId, body);
  return NextResponse.json(item, { status: 201 });
});

export const DELETE = authed(async (req, session) => {
  const url = new URL(req.url);
  if (url.searchParams.get("purchased") === "true") {
    const res = await clearPurchasedItems(session.accountId);
    return res;
  }
  return NextResponse.json({ error: "Invalid delete operation" }, { status: 400 });
});
