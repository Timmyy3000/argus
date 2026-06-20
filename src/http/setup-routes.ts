import type { FastifyInstance, FastifyRequest } from "fastify";
import { desc } from "drizzle-orm";
import { loadConfig } from "../config";
import type { Db } from "../db/client";
import { githubInstallations, webhookDeliveries } from "../db/schema";
import { getGitHubAppCredentials, saveGitHubAppCredentials } from "../github/credentials";
import { getGates } from "../settings/settings";

/**
 * GitHub App Manifest flow: the dashboard POSTs this manifest to
 * github.com/settings/apps/new, GitHub creates the App under the operator's
 * account and redirects back with a one-time code, and the callback exchanges
 * that code for the App's credentials. One click instead of a settings page.
 */
export function buildAppManifest(publicUrl: string, appName?: string): Record<string, unknown> {
  const base = publicUrl.replace(/\/$/, "");
  return {
    name: appName ?? defaultAppName(base),
    url: "https://github.com/Timmyy3000/argus",
    hook_attributes: { url: `${base}/webhooks/github`, active: true },
    redirect_url: `${base}/setup/github/callback`,
    public: false,
    default_permissions: {
      issues: "write",
      contents: "write",
      pull_requests: "write",
      metadata: "read",
    },
    default_events: ["issues"],
  };
}

export function defaultAppName(publicUrl: string): string {
  const host = publicUrl.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9-]+/g, "-");
  return `argus-${host}`.slice(0, 34).replace(/-+$/, "");
}

const githubOwnerLoginPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

export function buildGitHubManifestPostUrl(org?: string): string {
  const owner = org?.trim();
  if (!owner) return "https://github.com/settings/apps/new";
  if (!githubOwnerLoginPattern.test(owner)) {
    throw new Error("Invalid GitHub organization login");
  }
  return `https://github.com/organizations/${encodeURIComponent(owner)}/settings/apps/new`;
}

export function resolvePublicUrl(request: FastifyRequest, configured?: string | undefined): string {
  if (configured) return configured.replace(/\/$/, "");
  const proto = (request.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? request.protocol;
  const host = (request.headers["x-forwarded-host"] as string | undefined)?.split(",")[0] ?? request.headers.host;
  return `${proto}://${host}`;
}

type ManifestConversion = {
  id: number;
  slug: string;
  name: string;
  html_url: string;
  pem: string;
  webhook_secret: string;
  client_id: string;
  client_secret: string;
};

export async function registerSetupRoutes(app: FastifyInstance, deps: { db: Db; fetchImpl?: typeof fetch }) {
  const fetchImpl = deps.fetchImpl ?? fetch;

  app.get<{ Querystring: { org?: string } }>("/setup/github/manifest", async (request, reply) => {
    const config = loadConfig();
    const publicUrl = resolvePublicUrl(request, config.ARGUS_PUBLIC_URL);
    let postUrl: string;
    try {
      postUrl = buildGitHubManifestPostUrl(request.query.org);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
    return {
      postUrl,
      manifest: buildAppManifest(publicUrl),
      publicUrl,
    };
  });

  app.get<{ Querystring: { code?: string } }>("/setup/github/callback", async (request, reply) => {
    const code = request.query.code;
    if (!code) return reply.code(400).send({ error: "Missing manifest exchange code" });

    const response = await fetchImpl(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
      method: "POST",
      headers: { accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      request.log.error({ status: response.status, body: body.slice(0, 300) }, "manifest conversion failed");
      return reply.code(502).send({ error: `GitHub manifest conversion failed with ${response.status}` });
    }

    const conversion = (await response.json()) as ManifestConversion;
    await saveGitHubAppCredentials(deps.db, {
      appId: String(conversion.id),
      privateKey: conversion.pem,
      webhookSecret: conversion.webhook_secret,
      slug: conversion.slug,
      appName: conversion.name,
      htmlUrl: conversion.html_url,
      clientId: conversion.client_id,
      clientSecret: conversion.client_secret,
    });

    // Straight into GitHub's repository picker so "connect" finishes in one motion.
    return reply.redirect(`https://github.com/apps/${conversion.slug}/installations/new`);
  });

  app.get("/api/deliveries", async () => {
    const deliveries = await deps.db
      .select()
      .from(webhookDeliveries)
      .orderBy(desc(webhookDeliveries.receivedAt))
      .limit(25);
    return { deliveries };
  });

  app.get("/api/connection", async (request) => {
    const config = loadConfig();
    const credentials = await getGitHubAppCredentials(deps.db);
    const publicUrl = resolvePublicUrl(request, config.ARGUS_PUBLIC_URL);

    const installations = credentials
      ? await deps.db.query.githubInstallations.findMany({
          orderBy: [desc(githubInstallations.createdAt)],
        })
      : [];

    const repositories = credentials
      ? await deps.db.query.repositories.findMany({ with: { policy: true, installation: true } })
      : [];

    return {
      configured: Boolean(credentials),
      source: credentials?.source ?? null,
      slug: credentials?.slug ?? null,
      htmlUrl: credentials?.htmlUrl ?? null,
      installUrl: credentials?.slug ? `https://github.com/apps/${credentials.slug}/installations/new` : null,
      webhookUrl: `${publicUrl}/webhooks/github`,
      gates: await getGates(deps.db, loadConfig()),
      installations: installations.map((installation) => ({
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        repositories: repositories
          .filter((repo) => repo.installation.installationId === installation.installationId)
          .map((repo) => ({
            fullName: repo.fullName,
            private: repo.private,
            triggerLabel: repo.policy?.triggerLabel ?? "agent:fix",
          })),
      })),
    };
  });
}
