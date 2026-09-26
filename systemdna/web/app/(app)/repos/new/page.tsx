import type { Metadata } from "next";
import { ConnectRepoClient } from "./connect-client";

export const metadata: Metadata = { title: "Connect a repository" };

export default function ConnectRepoPage() {
  return <ConnectRepoClient />;
}
