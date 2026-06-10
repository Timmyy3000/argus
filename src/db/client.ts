import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadConfig } from "../config";
import * as schema from "./schema";

export function createDb(databaseUrl = loadConfig().DATABASE_URL) {
  const client = postgres(databaseUrl, { max: 10 });
  return {
    db: drizzle(client, { schema }),
    client,
  };
}

export type Db = ReturnType<typeof createDb>["db"];

let shared: ReturnType<typeof createDb> | null = null;

/**
 * Process-wide connection for modules that need database access outside the
 * request/job dependency graph (e.g. GitHub App credential lookup inside
 * Octokit helpers). Uses a small dedicated pool.
 */
export function getSharedDb(): Db {
  if (!shared) {
    const client = postgres(loadConfig().DATABASE_URL, { max: 2 });
    shared = { db: drizzle(client, { schema }), client };
  }
  return shared.db;
}

