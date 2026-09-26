import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GitHub sends the user here after they install (or change) the GitHub App.
 * Nothing needs saving: the server finds the installation for each repo when it
 * needs a token. We just send the user back to the Repositories page.
 */
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("setup_action") ?? "install";
  const back = new URL("/repos", request.nextUrl.origin);
  back.searchParams.set("github", action === "update" ? "updated" : "installed");
  return Response.redirect(back, 303);
}
