import { deleteRepo, getRepo } from "@/lib/server/repo-store";

export const dynamic = "force-dynamic";

/** The repository's knowledge graph and its index entry. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const found = await getRepo(id);
  if (!found) return Response.json({ error: "Repository not found" }, { status: 404 });
  return Response.json(found);
}

/** Removes the repository and its graph. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = await deleteRepo(id);
  return ok ? new Response(null, { status: 204 }) : Response.json({ error: "Repository not found" }, { status: 404 });
}
