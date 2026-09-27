import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GitHub sends the user here after they install (or change) the GitHub App.
 * Nothing needs saving: the server finds the installation for each repo when it
 * needs a token. We just send the user back to the Repositories page.
 */
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("setup_action") ?? "install";
  // Relative on purpose: behind a load balancer nextUrl.origin is the container's own
  // address (http://localhost:3000), not the domain the browser used.
  const back = `/repos?github=${action === "update" ? "updated" : "installed"}`;
  return new Response(null, { status: 303, headers: { Location: back } });
}
