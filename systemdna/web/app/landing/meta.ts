import type { Metadata } from "next";

/** Shared by "/" and "/landing", which render the same page. */
export const landingMetadata: Metadata = {
  title: { absolute: "SystemDNA — Find References for your whole system, and fix them all." },
  description:
    "SystemDNA shows what a code change will break across a whole system, then has a governed crew of IBM Bob agents fix every affected part and prove the change is complete.",
};
