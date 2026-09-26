// POST /api/graph/[id]/impact
// Body: { node: string; change: ChangeKind; to?: string; description?: string }
//   rename | type_change | signature  need `to` (new name, type or signature)
//   delete                            needs nothing else
//   custom                            needs `description`
// Returns the ImpactReport computed from the stored knowledge graph.
// This is the server-side equivalent of lib/impact.ts (which runs in the browser for demo mode).
import { getRepo } from "@/lib/server/graph-store";
import { computeImpact } from "@/lib/impact";
import { KINDS } from "@/lib/changes";
import type { ChangeRequest } from "@/lib/types";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Partial<ChangeRequest> | null;
  const kind = KINDS.find((k) => k.id === body?.change);
  if (!body?.node || !kind) {
    return Response.json({ error: `node and change (${KINDS.map((k) => k.id).join(", ")}) are required` }, { status: 400 });
  }
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (kind.input && !to) return Response.json({ error: `to is required for ${kind.id}` }, { status: 400 });
  if (kind.id === "custom" && !description) return Response.json({ error: "description is required for custom" }, { status: 400 });

  const result = await getRepo(id);
  if (!result) return Response.json({ error: "Repo not found" }, { status: 404 });

  try {
    const report = computeImpact(result.graph, {
      node: body.node,
      change: kind.id,
      to,
      ...(description ? { description } : {}),
    });
    return Response.json({ report });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Impact computation failed" },
      { status: 422 },
    );
  }
}
