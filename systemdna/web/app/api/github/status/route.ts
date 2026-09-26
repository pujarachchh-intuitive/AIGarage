import type { NextRequest } from "next/server";
import { githubStatus } from "@/lib/server/github-auth";
import { ownerRepo } from "@/lib/server/github-agent";

export const dynamic = "force-dynamic";

/**
 * What the server can do on GitHub: GitHub App, personal token or nothing.
 * With ?repo=<github url>, also says whether the app is installed on that repo.
 * Never returns a secret.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("repo");
  const repo = url ? ownerRepo(url) : null;
  return Response.json(await githubStatus(repo ?? undefined));
}
