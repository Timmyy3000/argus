import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Drives `codex login --device-auth` so the console can offer one-click
 * Codex subscription auth. Device-code OAuth needs no inbound callback:
 * the CLI prints a verification URL + one-time code, then polls OpenAI
 * until the operator approves from any browser. We parse the URL/code
 * from stdout and report the process's fate as the login state.
 */

export type LoginState =
  | { state: "idle" }
  | { state: "pending"; url: string | null; code: string | null; raw: string }
  | { state: "success" }
  | { state: "error"; message: string };

export type ParsedPrompt = { url: string | null; code: string | null };

const LOGIN_TIMEOUT_MS = 15 * 60_000;

/** Tolerant extraction — exact wording varies across codex versions. */
export function parseDevicePrompt(output: string): ParsedPrompt {
  const urlMatch = output.match(/https:\/\/\S+/);
  // The one-time code is a short grouped token like "BDSF-HKLM" or "ABCD-1234",
  // standing alone or after a label. Avoid matching UUID fragments inside URLs.
  const withoutUrls = output.replace(/https:\/\/\S+/g, " ");
  const codeMatch =
    withoutUrls.match(/code[^A-Z0-9]*([A-Z0-9]{4,8}(?:-[A-Z0-9]{4,8})+)/i) ??
    withoutUrls.match(/\b([A-Z0-9]{4,8}-[A-Z0-9]{4,8})\b/);
  return {
    url: urlMatch ? urlMatch[0].replace(/[).,]+$/, "") : null,
    code: codeMatch ? codeMatch[1] ?? null : null,
  };
}

export function codexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), ".codex");
}

export type AuthStatus = { connected: boolean; account: string | null };

/** Cheap check: a readable auth.json means codex has credentials. */
export function readAuthStatus(): AuthStatus {
  const path = join(codexHome(), "auth.json");
  if (!existsSync(path)) return { connected: false, account: null };
  try {
    const auth = JSON.parse(readFileSync(path, "utf8")) as { tokens?: { id_token?: string } };
    const idToken = auth.tokens?.id_token;
    if (idToken) {
      const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64").toString("utf8")) as { email?: string };
      return { connected: true, account: payload.email ?? null };
    }
    return { connected: true, account: null };
  } catch {
    return { connected: true, account: null };
  }
}

type SpawnFn = typeof spawn;

export class DeviceAuthManager {
  private child: ChildProcess | null = null;
  private current: LoginState = { state: "idle" };
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly spawnFn: SpawnFn = spawn) {}

  status(): LoginState {
    return this.current;
  }

  /** Starts a login if none is pending. Returns the live state. */
  start(): LoginState {
    if (this.current.state === "pending" && this.child) return this.current;

    let raw = "";
    const child = this.spawnFn("codex", ["login", "--device-auth"], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    this.current = { state: "pending", url: null, code: null, raw: "" };

    const onChunk = (chunk: Buffer) => {
      raw += chunk.toString();
      if (this.current.state !== "pending") return;
      const parsed = parseDevicePrompt(raw);
      this.current = { state: "pending", url: parsed.url, code: parsed.code, raw: raw.slice(0, 4000) };
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);

    child.on("error", (err) => {
      this.settle({ state: "error", message: `Could not run codex: ${err.message}` });
    });
    child.on("close", (exitCode) => {
      if (this.current.state !== "pending") return;
      this.settle(
        exitCode === 0
          ? { state: "success" }
          : { state: "error", message: raw.trim().split("\n").slice(-3).join("\n") || `codex login exited with ${exitCode}` },
      );
    });

    this.timer = setTimeout(() => {
      if (this.current.state === "pending") {
        child.kill("SIGKILL");
        this.settle({ state: "error", message: "Login timed out after 15 minutes." });
      }
    }, LOGIN_TIMEOUT_MS);

    return this.current;
  }

  cancel(): LoginState {
    if (this.current.state === "pending" && this.child) {
      this.child.kill("SIGKILL");
      this.settle({ state: "idle" });
    }
    return this.current;
  }

  private settle(state: LoginState) {
    this.current = state;
    this.child = null;
    if (this.timer) clearTimeout(this.timer);
  }
}
