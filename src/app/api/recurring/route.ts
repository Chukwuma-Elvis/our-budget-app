import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/api";
import { recurringCreateSchema } from "@/schemas";
import { createRecurring, listRecurring } from "@/server/recurring.service";

export const GET = authed(async (_req, session) => ({ items: await listRecurring(session.accountId) }));

export const POST = authed(async (req, session) => {
  const body = await parseBody(req, recurringCreateSchema);
  return NextResponse.json(await createRecurring(session.accountId, session.userId, body), { status: 201 });
});
