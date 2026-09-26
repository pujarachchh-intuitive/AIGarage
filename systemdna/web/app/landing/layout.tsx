import "./landing.css";
import { landingMetadata } from "./meta";

export const metadata = landingMetadata;

export default function LandingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="landing-root">{children}</div>;
}
