import { desc } from "drizzle-orm";
import { loadConfig } from "../config";
import { getSharedDb, type Db } from "../db/client";
import { githubAppConfig } from "../db/schema";

export type GitHubAppCredentials = {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  slug: string | null;
  htmlUrl: string | null;
  source: "database" | "environment";
};

const CACHE_TTL_MS = 30_000;

let cache: { value: GitHubAppCredentials | null; expiresAt: number } | null = null;

/**
 * Credentials created through the in-app connect flow live in the database and
 * take precedence; the GITHUB_* environment variables remain as a fallback for
 * operators who configured the App by hand.
 */
export async function getGitHubAppCredentials(db: Db = getSharedDb()): Promise<GitHubAppCredentials | null> {
  if (cache && Date.now() < cache.expiresAt) return cache.value;

  const row = await db.query.githubAppConfig.findFirst({
    orderBy: [desc(githubAppConfig.createdAt)],
  });

  let value: GitHubAppCredentials | null = null;
  if (row) {
    value = {
      appId: row.appId,
      privateKey: row.privateKey,
      webhookSecret: row.webhookSecret,
      slug: row.slug,
      htmlUrl: row.htmlUrl,
      source: "database",
    };
  } else {
    const config = loadConfig();
    if (config.GITHUB_APP_ID && config.GITHUB_PRIVATE_KEY && config.GITHUB_WEBHOOK_SECRET) {
      value = {
        appId: config.GITHUB_APP_ID,
        privateKey: config.GITHUB_PRIVATE_KEY,
        webhookSecret: config.GITHUB_WEBHOOK_SECRET,
        slug: null,
        htmlUrl: null,
        source: "environment",
      };
    }
  }

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export function invalidateGitHubAppCredentialsCache(): void {
  cache = null;
}

export async function saveGitHubAppCredentials(
  db: Db,
  input: {
    appId: string;
    privateKey: string;
    webhookSecret: string;
    slug?: string | null;
    appName?: string | null;
    htmlUrl?: string | null;
    clientId?: string | null;
    clientSecret?: string | null;
  },
) {
  const [row] = await db.insert(githubAppConfig).values(input).returning();
  invalidateGitHubAppCredentialsCache();
  return row;
}
