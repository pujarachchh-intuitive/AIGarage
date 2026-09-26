"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { secondaryButton } from "@/components/ui/page";
import { fetchGithubStatus } from "@/lib/api";
import type { GithubStatus } from "@/lib/types";

/** One line on the Repositories page: how the agent signs in to GitHub, and a link to install the app. */
export function GithubConnection() {
  const [status, setStatus] = useState<GithubStatus | null>(null);

  useEffect(() => {
    const load = () => void fetchGithubStatus().then(setStatus);
    load();
    // GitHub sends users back to /repos?github=installed after they install the app.
    const url = new URL(window.location.href);
    const back = url.searchParams.get("github");
    if (back) {
      toast.success(back === "updated" ? "GitHub App updated" : "GitHub App installed", {
        description: "The agent can now open pull requests on the repos you picked.",
      });
      url.searchParams.delete("github");
      window.history.replaceState(null, "", url);
    }
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  if (!status) return null;

  const text = status.error
    ? status.error
    : status.mode === "app"
      ? `The agent signs in as the ${status.app?.name} GitHub App. It gets a 1-hour token for each repo it changes, and its pull requests show up as ${status.app?.slug}[bot].`
      : status.mode === "token"
        ? `The agent uses a personal token (@${status.login}). Set up the GitHub App to let each user pick their own repos.`
        : "The agent is not connected to GitHub. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH in web/.env.local, then restart.";

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-border bg-surface">
      <Link2 className="size-4 text-icon-secondary shrink-0" />
      <div className="flex flex-col gap-0.5 flex-1 min-w-60">
        <span className="flex items-center gap-2 text-body font-semibold text-text-primary">
          GitHub
          {status.error ? (
            <Badge variant="destructive">Problem</Badge>
          ) : status.mode === "app" ? (
            <Badge variant="success">GitHub App</Badge>
          ) : status.mode === "token" ? (
            <Badge variant="neutral">Personal token</Badge>
          ) : (
            <Badge variant="neutral">Not connected</Badge>
          )}
        </span>
        <span className={status.error ? "type-caption text-error" : "type-caption"}>{text}</span>
      </div>
      {status.mode === "app" && status.app && !status.error ? (
        <a href={status.app.installUrl} target="_blank" rel="noreferrer" className={secondaryButton}>
          <ExternalLink />
          Install or pick repos
        </a>
      ) : null}
    </div>
  );
}
