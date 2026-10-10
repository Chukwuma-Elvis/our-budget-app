import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, badRequest } from "./errors";
import { requireSession, type Session } from "./session";

type Ctx<P> = { params: Promise<P> };

function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, fields: err.fields } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
    return NextResponse.json(
      { error: { code: "bad_request", message: "Please check the highlighted fields", fields } },
      { status: 400 },
    );
  }
  console.error(err);
  return NextResponse.json(
    { error: { code: "server_error", message: "Something went wrong" } },
    { status: 500 },
  );
}

/** Wraps a route handler that needs a signed-in user. */
export function authed<P = Record<string, never>>(
  handler: (req: Request, session: Session, params: P) => Promise<Response | unknown>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const session = await requireSession();
      const params = ctx?.params ? await ctx.params : ({} as P);
      const result = await handler(req, session, params);
      return result instanceof Response ? result : NextResponse.json(result);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Wraps a public route handler (no session required). */
export function open<P = Record<string, never>>(
  handler: (req: Request, params: P) => Promise<Response | unknown>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      const result = await handler(req, params);
      return result instanceof Response ? result : NextResponse.json(result);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest("Invalid request body");
  }
  return schema.parse(json);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const url = new URL(req.url);
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}
