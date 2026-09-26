import { githubStatus } from "@/lib/server/github-agent";

export const dynamic = "force-dynamic";

/** Whether the server has a GitHub token, and whose. Never returns the token. */
export async function GET() {
  return Response.json(await githubStatus());
}
