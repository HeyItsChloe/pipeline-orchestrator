// GitHub App auth (JWT -> installation token exchange, cached) plus the
// small set of GitHub API calls the engine needs. Permissions live on the
// App; scaling to a new repo is an install, not a re-minted/re-scoped token.
import jwt from "jsonwebtoken";

const GITHUB_API = "https://api.github.com";

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
}

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

const installationTokenCache = new Map<string, CachedToken>();

function signAppJwt(config: GitHubAppConfig): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now - 60, exp: now + 9 * 60, iss: config.appId },
    config.privateKey,
    { algorithm: "RS256" },
  );
}

/** Installation tokens expire in 1h; refresh 5 minutes early and cache per installation. */
export async function getInstallationToken(config: GitHubAppConfig, installationId: string): Promise<string> {
  const cached = installationTokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }

  const appJwt = signAppJwt(config);
  const res = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appJwt}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`failed to mint installation token: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { token: string; expires_at: string };
  const cachedToken: CachedToken = { token: body.token, expiresAt: Date.parse(body.expires_at) };
  installationTokenCache.set(installationId, cachedToken);
  return cachedToken.token;
}

async function githubRequest(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? undefined : res.json();
}

export async function labelIssue(token: string, owner: string, repo: string, issueNumber: number, label: string) {
  await githubRequest(token, `/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [label] }),
  });
}

export async function addIssueComment(token: string, owner: string, repo: string, issueNumber: number, body: string) {
  await githubRequest(token, `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export interface IssueStatus {
  number: number;
  title: string;
  state: string;
  labels: string[];
  html_url: string;
}

export async function getIssue(token: string, owner: string, repo: string, issueNumber: number): Promise<IssueStatus> {
  const issue = (await githubRequest(token, `/repos/${owner}/${repo}/issues/${issueNumber}`)) as {
    number: number;
    title: string;
    state: string;
    labels: Array<{ name: string } | string>;
    html_url: string;
  };
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name)),
    html_url: issue.html_url,
  };
}

export async function createTicket(token: string, owner: string, repo: string, title: string, body: string): Promise<IssueStatus> {
  const issue = (await githubRequest(token, `/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  })) as { number: number; title: string; state: string; html_url: string };
  return { ...issue, labels: [] };
}

/** Fires a GitHub Actions workflow via repository_dispatch, for chat/curl-originated jobs. */
export async function dispatchRepositoryEvent(
  token: string,
  owner: string,
  repo: string,
  action: string,
  issueNumber: number,
) {
  await githubRequest(token, `/repos/${owner}/${repo}/dispatches`, {
    method: "POST",
    body: JSON.stringify({
      event_type: "agent-trigger",
      client_payload: { action, issue_number: issueNumber },
    }),
  });
}

/**
 * Reads a file's raw content from a repo. Used to fetch skill files (and,
 * for a self-hoster's own deployment, registry data) from wherever they
 * actually live, since a self-hosted engine's own container may not have
 * that content baked in locally.
 */
export async function getFileContents(token: string, owner: string, repo: string, path: string, ref: string): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${ref}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw" },
  });
  if (!res.ok) {
    throw new Error(`failed to read ${path}: ${res.status} ${await res.text()}`);
  }
  return res.text();
}

/** Used by the scaffold tool to write a new skill file / registry entry / caller workflow. */
export async function createOrUpdateFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
) {
  let sha: string | undefined;
  try {
    const existing = (await githubRequest(
      token,
      `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    )) as { sha: string };
    sha = existing.sha;
  } catch {
    // File doesn't exist yet — creating, not updating.
  }
  await githubRequest(token, `/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
}
