import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDueRecurring } from "@/server/recurring.service";

export const dynamic = "force-dynamic";

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok =
    !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized" } }, { status: 401 });
  return NextResponse.json(await runDueRecurring());
}
