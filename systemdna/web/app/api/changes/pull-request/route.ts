import { pullRequestFromPatchStream } from "@/lib/server/change-agent";

export const dynamic = "force-dynamic";

/**
 * Open a DRAFT pull request from a real run's stored patch: fresh clone, apply
 * the exact previewed diff, new branch systemdna/<change>, push. Never the
 * default branch. Streams AgentEvent as newline-delimited JSON.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { patchId?: string; title?: string; body?: string } | null;
  if (!body?.patchId) return Response.json({ error: "patchId is required" }, { status: 400 });
  return pullRequestFromPatchStream({ patchId: String(body.patchId), title: String(body.title ?? "").slice(0, 200), body: String(body.body ?? "") });
}
