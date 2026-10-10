import { open } from "@/lib/api";
import { destroySession } from "@/lib/session";

export const POST = open(async () => {
  await destroySession();
  return { ok: true };
});
