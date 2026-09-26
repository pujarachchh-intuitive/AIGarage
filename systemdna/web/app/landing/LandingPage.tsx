/**
 * LandingPage — assembles all landing sections.
 * This is a Server Component; each section is a Client Component.
 * The "use client" boundary is inside each section file.
 */

import { HeroSection } from "./HeroSection";
import { ProblemSection } from "./ProblemSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { TrapsSection } from "./TrapsSection";
import { AgentCityPreviewSection } from "./AgentCityPreviewSection";
import { GovernanceSection } from "./GovernanceSection";
import { BuiltWithBobSection } from "./BuiltWithBobSection";
import { ProofSection } from "./ProofSection";
import { ArchitectureSection } from "./ArchitectureSection";
import { FooterSection } from "./FooterSection";

export function LandingPage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "#05070d", color: "#fff" }}
    >
      {/* Skip to main content link for keyboard users */}
      <a
        href="#hero"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-white focus:text-black focus:font-semibold"
      >
        Skip to main content
      </a>

      <main id="main-content">
        <HeroSection />
        <ProblemSection />
        <HowItWorksSection />
        <TrapsSection />
        <AgentCityPreviewSection />
        <GovernanceSection />
        <BuiltWithBobSection />
        <ProofSection />
        <ArchitectureSection />
      </main>

      <FooterSection />
    </div>
  );
}
