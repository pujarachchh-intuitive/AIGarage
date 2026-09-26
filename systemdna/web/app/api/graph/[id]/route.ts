// GET  /api/graph/[id]          → { entry, graph } or 404
// GET  /api/graph/[id]?summary  → lightweight stats without the full graph
import { getRepo, getRepoDetail, getGraphSummary } from "@/lib/server/graph-store";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);

  if (url.searchParams.has("summary")) {
    const summary = await getGraphSummary(id);
    if (!summary) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(summary);
  }

  if (url.searchParams.has("detail")) {
    const detail = await getRepoDetail(id);
    if (!detail) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(detail);
  }

  const result = await getRepo(id);
  if (!result) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(result);
}
