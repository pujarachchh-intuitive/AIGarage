import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./landing.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { absolute: "SystemDNA — Find References for your whole system, and fix them all." },
  description:
    "SystemDNA shows what a code change will break across a whole system, then has a governed crew of IBM Bob agents fix every affected part and prove the change is complete.",
};

export default function LandingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`landing-root ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>{children}</div>;
}
