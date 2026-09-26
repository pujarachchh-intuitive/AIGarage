import { Suspense } from "react";
import type { Metadata } from "next";
import { NewChangeClient } from "./new-change-client";

export const metadata: Metadata = { title: "New change" };

export default function NewChangePage() {
  return (
    <Suspense>
      <NewChangeClient />
    </Suspense>
  );
}
