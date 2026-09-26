// GitHub credentials for the agent. Two ways to sign in:
//
//   GitHub App (preferred)  GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY_PATH (or
//                           GITHUB_APP_PRIVATE_KEY). The server signs a short JWT
//                           (a signed "I am this app" message) with the private key,
//                           then trades it for a token that works on ONE repo for
//                           1 hour. PRs show up as <slug>[bot].
//   Personal token          GITHUB_TOKEN. Used only when no app is set up.
//
// Tokens never leave the server. Every token this file hands out is remembered in
// SECRETS so scrub() can hide it from error messages.

import "server-only";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";

const API = "https://api.github.com";
const SECRETS = new Set<string>();

export type GithubMode = "app" | "token" | "none";

export interface RepoCredentials {
  token: string;
  mode: "app" | "token";
  /** Who the commit is made as. */
  author: { name: string; email: string };
}

export interface GithubStatus {
  configured: boolean;
  mode: GithubMode;
  /** Personal token: the account's login. */
  login?: string;
  /** GitHub App: its name, slug and the page where users install it. */
  app?: { name: string; slug: string; installUrl: string };
  /** GitHub App with ?repo=: is the app installed on that repo? */
  installed?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

let cachedKey: { source: string; key: KeyObject } | null = null;

function appId() {
  return process.env.GITHUB_APP_ID?.trim() || "";
}

function personalToken() {
  const t = process.env.GITHUB_TOKEN?.trim() || "";
  if (t) SECRETS.add(t);
  return t;
}

/** The app's private key, from an inline value or a .pem file. Throws a clear message on failure. */
function privateKey(): KeyObject {
  const inline = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  const file = process.env.GITHUB_APP_PRIVATE_KEY_PATH?.trim().replace(/^"(.*)"$/, "$1");
  const source = inline ? "inline" : file || "";
  if (cachedKey?.source === source) return cachedKey.key;
  let pem: string;
  if (inline) {
    // .env files often hold the key on one line with literal \n.
    pem = inline.replace(/\\n/g, "\n");
  } else if (file) {
    try {
      pem = readFileSync(/*turbopackIgnore: true*/ file, "utf8");
    } catch {
      throw new Error(`Could not read the GitHub App private key at GITHUB_APP_PRIVATE_KEY_PATH. Check the path.`);
    }
  } else {
    throw new Error("Set GITHUB_APP_PRIVATE_KEY_PATH (path to the app's .pem file) or GITHUB_APP_PRIVATE_KEY.");
  }
  try {
    const key = createPrivateKey(pem);
    cachedKey = { source, key };
    return key;
  } catch {
    throw new Error("The GitHub App private key is not a valid PEM file.");
  }
}

export function githubMode(): GithubMode {
  if (appId()) return "app";
  if (personalToken()) return "token";
  return "none";
}

// ---------------------------------------------------------------------------
// App JWT and installation tokens
// ---------------------------------------------------------------------------

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

/** A JWT that proves "I am this app". GitHub accepts at most 10 minutes; we use 9. */
function appJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // iat 60s in the past covers small clock drift between us and GitHub.
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId() }));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey());
  const jwt = `${header}.${payload}.${base64url(signature)}`;
  SECRETS.add(jwt);
  return jwt;
}

async function call<T>(pathname: string, auth: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "SystemDNA-agent",
      ...init?.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; errors?: { message?: string }[] };
  if (!res.ok) {
    const detail = body.errors?.map((e) => e.message).filter(Boolean).join("; ");
    throw Object.assign(new Error(`GitHub ${res.status}: ${body.message ?? "request failed"}${detail ? ` (${detail})` : ""}`), { status: res.status });
  }
  return body;
}

let appInfo: { name: string; slug: string } | null = null;

async function getApp() {
  if (!appInfo) {
    const a = await call<{ name: string; slug: string }>("/app", appJwt());
    appInfo = { name: a.name, slug: a.slug };
  }
  return appInfo;
}

function installUrl(slug: string) {
  return `https://github.com/apps/${process.env.GITHUB_APP_SLUG?.trim() || slug}/installations/new`;
}

/** The installation id for a repo, or null when the app is not installed there. */
async function installationId(owner: string, repo: string): Promise<number | null> {
  try {
    const inst = await call<{ id: number }>(`/repos/${owner}/${repo}/installation`, appJwt());
    return inst.id;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

// Installation tokens last 1 hour. Reuse one until 5 minutes before it expires.
const tokenCache = new Map<string, { token: string; expires: number }>();

async function installationToken(owner: string, repo: string): Promise<string | null> {
  const key = `${owner}/${repo}`.toLowerCase();
  const hit = tokenCache.get(key);
  if (hit && hit.expires - Date.now() > 5 * 60_000) return hit.token;
  const id = await installationId(owner, repo);
  if (id === null) return null;
  // Ask for the smallest token that does the job: this one repo, these two permissions.
  const res = await call<{ token: string; expires_at: string }>(`/app/installations/${id}/access_tokens`, appJwt(), {
    method: "POST",
    body: JSON.stringify({ repositories: [repo], permissions: { contents: "write", pull_requests: "write", metadata: "read" } }),
  });
  SECRETS.add(res.token);
  tokenCache.set(key, { token: res.token, expires: Date.parse(res.expires_at) });
  return res.token;
}

let botAuthor: { name: string; email: string } | null = null;

/** Commits by the app show its avatar when the email is <bot user id>+<slug>[bot]@users.noreply.github.com. */
async function appAuthor(): Promise<{ name: string; email: string }> {
  if (botAuthor) return botAuthor;
  const { slug } = await getApp();
  const name = `${slug}[bot]`;
  try {
    const user = await call<{ id: number }>(`/users/${encodeURIComponent(name)}`, null);
    botAuthor = { name, email: `${user.id}+${name}@users.noreply.github.com` };
  } catch {
    botAuthor = { name, email: `${name}@users.noreply.github.com` };
  }
  return botAuthor;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * A token that can push to owner/repo, or null when there is none.
 * GitHub App first; the personal token only when no app is set up.
 */
export async function credentialsFor(owner: string, repo: string): Promise<RepoCredentials | null> {
  const mode = githubMode();
  if (mode === "app") {
    const token = await installationToken(owner, repo);
    if (!token) {
      const { slug } = await getApp();
      throw new Error(`The GitHub App is not installed on ${owner}/${repo}. Install it here: ${installUrl(slug)}`);
    }
    return { token, mode: "app", author: await appAuthor() };
  }
  if (mode === "token") return { token: personalToken(), mode: "token", author: { name: "SystemDNA Agent", email: "agent@systemdna.dev" } };
  return null;
}

/** What the server can do on GitHub. With a repo, also says whether the app is installed there. Never returns a secret. */
export async function githubStatus(repo?: { owner: string; repo: string }): Promise<GithubStatus> {
  const mode = githubMode();
  try {
    if (mode === "app") {
      const app = await getApp();
      const status: GithubStatus = { configured: true, mode, app: { ...app, installUrl: installUrl(app.slug) } };
      if (repo) status.installed = (await installationId(repo.owner, repo.repo)) !== null;
      return status;
    }
    if (mode === "token") {
      const me = await call<{ login: string }>("/user", personalToken());
      return { configured: true, mode, login: me.login };
    }
    return { configured: false, mode };
  } catch (err) {
    return { configured: true, mode, error: scrub(err instanceof Error ? err.message : "GitHub check failed") };
  }
}

/** Calls the GitHub REST API with a repo token. */
export function githubApi<T>(token: string, pathname: string, init?: RequestInit) {
  return call<T>(pathname, token, init);
}

/** Never let a token, JWT or auth header reach a message. */
export function scrub(message: string) {
  let out = message;
  for (const s of SECRETS) out = out.split(s).join("***");
  return out.replace(/AUTHORIZATION: basic [A-Za-z0-9+/=]+/gi, "AUTHORIZATION: ***");
}
