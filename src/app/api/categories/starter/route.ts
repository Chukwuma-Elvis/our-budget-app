import { authed } from "@/lib/api";
import { addStarterCategories } from "@/server/categories.service";

export const POST = authed(async (_req, session) => {
  return { created: await addStarterCategories(session.accountId, session.userId) };
});
