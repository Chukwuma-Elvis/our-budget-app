import { open } from "@/lib/api";
import { loginOptions } from "@/server/passkeys.service";

export const POST = open(async () => loginOptions());
