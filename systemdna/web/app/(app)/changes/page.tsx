import type { Metadata } from "next";
import { ChangesClient } from "./changes-client";

export const metadata: Metadata = { title: "Changes" };

export default function ChangesPage() {
  return <ChangesClient />;
}
