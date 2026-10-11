import { authed, parseBody } from "@/lib/api";
import { shoppingImportSchema } from "@/schemas";
import { importPreviousMonthFoodItems } from "@/server/shopping.service";

export const POST = authed(async (req, session) => {
  const body = await parseBody(req, shoppingImportSchema);
  const result = await importPreviousMonthFoodItems(session.accountId, session.userId, body);
  return result;
});
