import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/api";
import { receiptScanSchema } from "@/schemas";
import { scanReceipt } from "@/server/ai-receipt.service";

export const POST = authed(async (req, session) => {
  const body = await parseBody(req, receiptScanSchema);
  const result = await scanReceipt(session.accountId, body.imageBase64, body.mimeType);
  return NextResponse.json(result);
});
