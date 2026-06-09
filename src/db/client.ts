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

