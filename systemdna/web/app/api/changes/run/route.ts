import { changeRunStream, validateRunRequest } from "@/lib/server/change-agent";
import type { ChangeRunRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Run a planned change for real in a fresh clone: the TypeScript compiler for
 * renames of TypeScript symbols, IBM Bob Fixer agents for everything else.
 * Streams ChangeStreamLine as newline-delimited JSON. Nothing is pushed.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChangeRunRequest | null;
  if (!body) return Response.json({ error: "Send a JSON body" }, { status: 400 });
  const req: ChangeRunRequest = {
    url: String(body.url ?? "").trim(),
    ref: body.ref ? String(body.ref).trim() : undefined,
    change: {
      ...body.change,
      id: String(body.change?.id ?? "").replace(/[^\w-]/g, "").slice(0, 40),
      title: String(body.change?.title ?? "").slice(0, 200),
    },
    origin: body.origin,
    context: body.context && typeof body.context === "object" ? body.context : {},
  };
  const bad = validateRunRequest(req);
  if (bad) return Response.json({ error: bad }, { status: 400 });
  return changeRunStream(req);
}
