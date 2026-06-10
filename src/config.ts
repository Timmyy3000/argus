import { z } from "zod";

/**
 * z.coerce.boolean() treats any non-empty string as true, so the env value
 * "false" would silently open every stage gate. Gates fail closed: only
 * explicit affirmative strings enable a feature.
 */
const envBoolean = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return defaultValue;
    if (typeof value === "boolean") return value;
    return ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase());
  }, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().default("postgres://resolver:resolver@localhost:55432/resolver"),
  ARGUS_PUBLIC_URL: z.string().optional(),
  ARGUS_DASHBOARD_TOKEN: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ARGUS_WORKDIR: z.string().default(".argus-work"),
  ARGUS_KEEP_WORKSPACE: envBoolean(false),
  ARGUS_ENABLE_CODEX: envBoolean(false),
  ARGUS_ENABLE_TRIAGE: envBoolean(false),
  ARGUS_ENABLE_LLM_REVIEW: envBoolean(false),
  ARGUS_MAX_DIFF_BYTES: z.coerce.number().int().positive().default(200_000),
  ARGUS_LLM_MODEL: z.string().default("gpt-5-mini"),
  ARGUS_LLM_BASE_URL: z.string().default("https://api.openai.com/v1"),
  ARGUS_ENABLE_GIT_PUSH: envBoolean(false),
  ARGUS_SANDBOX_MODE: z.enum(["host", "docker"]).default("host"),
  ARGUS_SANDBOX_IMAGE: z.string().default("oven/bun:1"),
  ARGUS_SANDBOX_NETWORK: z.enum(["none", "bridge"]).default("bridge"),
  ARGUS_SANDBOX_MEMORY: z.string().default("2g"),
  ARGUS_SANDBOX_CPUS: z.string().default("2"),
  ARGUS_SANDBOX_PIDS: z.coerce.number().int().positive().default(512),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
