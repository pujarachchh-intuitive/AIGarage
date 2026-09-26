import type { Metadata } from "next";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: "SystemDNA — Find References for your whole system, and fix them all." },
  description:
    "SystemDNA shows what a code change will break across a whole system, then has a governed crew of IBM Bob agents fix every affected part and prove the change is complete.",
};

export default function LandingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="landing-root">{children}</div>;
}
