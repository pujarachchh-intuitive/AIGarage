import type { Metadata } from "next";
import { ReposClient } from "./repos-client";

export const metadata: Metadata = { title: "Repositories" };

export default function ReposPage() {
  return <ReposClient />;
}
