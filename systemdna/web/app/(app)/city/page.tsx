import { Suspense } from "react";
import type { Metadata } from "next";
import { CityClient } from "./city-client";

export const metadata: Metadata = { title: "Atlas" };

export default function CityPage() {
  return (
    <Suspense>
      <CityClient />
    </Suspense>
  );
}
