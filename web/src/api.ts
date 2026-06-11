import type { Connection, JobDetail, JobSummary, ManifestResponse } from "./types";

const TOKEN_KEY = "argus.dashboard.token";

/**
 * Magic-link sign-in: the server prints an access URL like
 * https://host/#token=... at startup. The token rides in the hash fragment so
 * it never appears in proxy or access logs, gets stored once, and is scrubbed
 * from the address bar (and history) immediately.
 */
export function consumeTokenFromUrl(): void {
  const match = /(?:^|[#&])token=([^&]+)/.exec(window.location.hash);
  if (!match?.[1]) return;
  setToken(decodeURIComponent(match[1]));
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string): Promise<T> {
  const token = getToken();
  const response = await fetch(path, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(`${path} returned ${response.status}`, response.status);
  return (await response.json()) as T;
}

export const api = {
  jobs: () => request<{ jobs: JobSummary[] }>("/jobs"),
  job: (id: string) => request<JobDetail>(`/jobs/${id}`),
  connection: () => request<Connection>("/api/connection"),
  manifest: () => request<ManifestResponse>("/setup/github/manifest"),
};

/**
 * GitHub's manifest flow requires a real form POST (not fetch) so the browser
 * navigates to GitHub, creates the App, and follows the redirect chain back.
 */
export function postManifestForm(postUrl: string, manifest: Record<string, unknown>): void {
  const form = document.createElement("form");
  form.method = "post";
  form.action = postUrl;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "manifest";
  input.value = JSON.stringify(manifest);
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}
