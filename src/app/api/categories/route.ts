import { authed, parseBody } from "@/lib/api";
import { categoryCreateSchema } from "@/schemas";
import { createCategory, listCategories } from "@/server/categories.service";

export const GET = authed(async (req, session) => {
  const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "true";
  return { categories: await listCategories(session.accountId, includeArchived) };
});

export const POST = authed(async (req, session) => {
  const body = await parseBody(req, categoryCreateSchema);
  return createCategory(session.accountId, session.userId, body);
});
