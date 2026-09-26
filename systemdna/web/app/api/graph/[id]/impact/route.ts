// POST /api/graph/[id]/impact
// Body: { node: string; change: "rename" | "type_change" | "delete"; to: string }
// Returns the ImpactReport computed from the stored knowledge graph.
// This is the server-side equivalent of lib/impact.ts (which runs in the browser for demo mode).
import { getRepo } from "@/lib/server/graph-store";
import { computeImpact } from "@/lib/impact";
import type { ChangeRequest } from "@/lib/types";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Partial<ChangeRequest> | null;
  if (!body?.node || !body.change || !body.to) {
    return Response.json({ error: "node, change and to are required" }, { status: 400 });
  }

  const result = await getRepo(id);
  if (!result) return Response.json({ error: "Repo not found" }, { status: 404 });

  try {
    const report = computeImpact(result.graph, {
      node: body.node,
      change: body.change,
      to: body.to,
    });
    return Response.json({ report });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Impact computation failed" },
      { status: 422 },
    );
  }
}
