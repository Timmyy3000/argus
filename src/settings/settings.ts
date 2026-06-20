import type { AppConfig } from "../config";
import type { Db } from "../db/client";
import { appSettings } from "../db/schema";

/**
 * Pipeline gates, toggled live from the console. Stored in app_settings as
 * "gate.<key>" = "true"|"false"; unset gates fall back to the env default so
 * existing deployments keep their behavior until an operator flips a switch.
 */
export const GATE_KEYS = ["triage", "codex", "llmReview", "gitPush"] as const;
export type GateKey = (typeof GATE_KEYS)[number];
export type Gates = Record<GateKey, boolean>;

const GATE_PREFIX = "gate.";

export function envGateDefaults(config: AppConfig): Gates {
  return {
    triage: config.ARGUS_ENABLE_TRIAGE,
    codex: config.ARGUS_ENABLE_CODEX,
    llmReview: config.ARGUS_ENABLE_LLM_REVIEW,
    gitPush: config.ARGUS_ENABLE_GIT_PUSH,
  };
}

/** Merge stored settings rows over the env defaults. Pure. */
export function resolveGates(rows: Array<{ key: string; value: string }>, defaults: Gates): Gates {
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const gates = { ...defaults };
  for (const key of GATE_KEYS) {
    const value = stored.get(GATE_PREFIX + key);
    if (value !== undefined) gates[key] = value === "true";
  }
  return gates;
}

export async function getGates(db: Db, config: AppConfig): Promise<Gates> {
  const rows = await db.select().from(appSettings);
  return resolveGates(rows, envGateDefaults(config));
}

export type GateUpdate = { [K in GateKey]?: boolean | undefined };

export async function setGates(db: Db, partial: GateUpdate): Promise<void> {
  for (const key of GATE_KEYS) {
    const next = partial[key];
    if (next === undefined) continue;
    const value = next ? "true" : "false";
    await db
      .insert(appSettings)
      .values({ key: GATE_PREFIX + key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  }
}
