import { bobStatus } from "@/lib/server/bob";

export const dynamic = "force-dynamic";

/** Whether IBM Bob can run on this server. Never returns the key. */
export async function GET() {
  return Response.json(await bobStatus());
}
