import { ingestGit, ingestZip, ndjsonStream } from "@/lib/server/ingest";
import { listRepos } from "@/lib/server/repo-store";

export const dynamic = "force-dynamic";

/** Connected repositories (newest first). */
export async function GET() {
  return Response.json(await listRepos());
}

/**
 * Connect a repository and build its knowledge graph.
 *   JSON body { url, ref?, bob? }        -> clone a public git repo
 *   multipart form with "file" (+ "bob") -> upload a .zip
 * bob: true also runs the IBM Bob Cartographer (off unless asked for).
 * The response streams progress as newline-delimited JSON.
 */
export async function POST(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !/\.zip$/i.test(file.name)) {
      return Response.json({ error: "Attach a .zip file." }, { status: 400 });
    }
    const bob = form.get("bob") === "true";
    return ndjsonStream((emit) => ingestZip(file, emit, { bob }));
  }
  const body = (await request.json().catch(() => null)) as { url?: string; ref?: string; bob?: boolean } | null;
  const url = body?.url?.trim() ?? "";
  const ref = body?.ref?.trim() || undefined;
  if (!url) return Response.json({ error: "Enter a repository URL." }, { status: 400 });
  return ndjsonStream((emit) => ingestGit(url, ref, emit, undefined, { bob: body?.bob === true }));
}
