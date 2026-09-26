import { agentStream, type PullRequestInput } from "@/lib/server/github-agent";

export const dynamic = "force-dynamic";

/**
 * Run the GitHub agent for one change.
 *   dryRun: true   clone, edit, check, return the diff. Nothing is pushed.
 *   dryRun: false  the same, then push a new branch and open a draft PR.
 * Streams progress as newline-delimited JSON.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<PullRequestInput> | null;
  if (!body?.url || !body.field || !body.to || !body.changeId) {
    return Response.json({ error: "url, field, to and changeId are required" }, { status: 400 });
  }
  return agentStream({
    url: String(body.url).trim(),
    ref: body.ref ? String(body.ref).trim() : undefined,
    field: String(body.field),
    to: String(body.to),
    changeId: String(body.changeId).replace(/[^\w-]/g, "").slice(0, 40) || "change",
    title: String(body.title ?? `Rename ${body.field} to ${body.to}`).slice(0, 200),
    body: String(body.body ?? ""),
    dryRun: body.dryRun !== false,
    repoId: body.repoId ? String(body.repoId).replace(/[^\w-]/g, "").slice(0, 80) : undefined,
  });
}
