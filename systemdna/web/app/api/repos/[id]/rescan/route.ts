import { ingestGit, ndjsonStream } from "@/lib/server/ingest";
import { getRepo } from "@/lib/server/repo-store";

export const dynamic = "force-dynamic";

/**
 * Pulls the latest code for a git repository and rebuilds its graph (same id).
 * Repos first connected with the IBM Bob Cartographer are enriched again.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const found = await getRepo(id);
  if (!found) return Response.json({ error: "Repository not found" }, { status: 404 });
  if (found.entry.source !== "git" || !found.entry.url) {
    return Response.json({ error: "Uploaded repositories cannot be re-scanned. Upload the zip again." }, { status: 400 });
  }
  const { url, ref } = found.entry;
  const bob = found.entry.stats.bobLinks !== undefined;
  return ndjsonStream((emit) => ingestGit(url!, ref, emit, id, { bob }));
}
