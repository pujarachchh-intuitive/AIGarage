import "./landing/landing.css";
import { LandingPage } from "./landing/LandingPage";
import { landingMetadata } from "./landing/meta";

export const metadata = landingMetadata;

// The landing page: a scroll story over the live 3D model of the demo repo.
// The earlier product tour lives at /tour.
export default function Home() {
  return (
    <div className="landing-root">
      <LandingPage />
    </div>
  );
}
