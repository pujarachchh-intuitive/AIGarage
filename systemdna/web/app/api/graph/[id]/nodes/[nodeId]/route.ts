// GET /api/graph/[id]/nodes/[nodeId]          → single node or 404
// GET /api/graph/[id]/nodes/[nodeId]?edges=out  → outgoing edges
// GET /api/graph/[id]/nodes/[nodeId]?edges=in   → incoming edges
// GET /api/graph/[id]/nodes/[nodeId]?edges=all  → both directions
import { getEdges, getNode } from "@/lib/server/graph-store";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
) {
  const { id, nodeId } = await params;
  const decoded = decodeURIComponent(nodeId);
  const url = new URL(request.url);
  const edgesParam = url.searchParams.get("edges");

  if (edgesParam === "in" || edgesParam === "out" || edgesParam === "all") {
    const edges = await getEdges(id, decoded, edgesParam);
    if (!edges) return Response.json({ error: "Repo not found" }, { status: 404 });
    return Response.json({ edges });
  }

  const node = await getNode(id, decoded);
  if (!node) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ node });
}
