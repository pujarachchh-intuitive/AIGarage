import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { getLandingData } from "@/lib/landing-data";

export const metadata: Metadata = {
  title: { absolute: "SystemDNA product tour: see what a change will break, then fix it safely" },
  description:
    "SystemDNA maps every file, type and field in your code, shows exactly what a change will break, and lets governed agents fix it and open a draft pull request.",
};

// The product tour. The numbers are worked out on the server from the sample repo,
// so the browser only downloads a small summary.
export default function Tour() {
  return <LandingPage data={getLandingData()} />;
}
