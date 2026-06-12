import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { CodexStatus, Connection } from "../types";
import { Btn, EyeMark, Icon } from "../ui";

const GATE_INFO: Array<{ key: keyof Connection["gates"]; name: string; desc: string }> = [
  { key: "triage", name: "Triage", desc: "Decide whether an issue has enough detail to act on (LLM; heuristic fallback when off)." },
  { key: "codex", name: "Codex", desc: "Let Codex write the fix in a sandboxed workspace." },
  { key: "llmReview", name: "Review", desc: "Run an LLM review pass over the diff (mechanical checks always run)." },
  { key: "gitPush", name: "Push", desc: "Allow Argus to push a branch and open a pull request on a clean pass." },
];

/**
 * Codex subscription auth via device-code login: the api spawns
 * `codex login --device-auth`, we surface the one-time code + URL, and the
 * operator approves from any browser. No file copying.
 */
function CodexCard() {
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = status?.login.state === "pending";

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.codexStatus());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pending ? 3000 : 10000);
    return () => clearInterval(id);
  }, [refresh, pending]);

  const act = async (call: () => Promise<CodexStatus>) => {
    try {
      setStatus(await call());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const login = status?.login;
  const connected = status?.auth.connected ?? false;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Codex</h3>
        {status && (
          <span className={"badge " + (connected ? "g" : "q")}>
            <span className={"dot " + (connected ? "g" : "q")}></span>
            {connected ? (status.auth.account ?? "connected") : "not connected"}
          </span>
        )}
      </div>
      <div className="panel-pad">
        {error && <div className="fault">codex fault — {error}</div>}

        {!status && <p className="muted" style={{ fontSize: 12, margin: 0 }}>checking…</p>}

        {status && !pending && (
          <>
            <p style={{ fontSize: 12.5, color: "var(--ink-2)", margin: "0 0 14px" }}>
              {connected
                ? "Fixes run on this ChatGPT subscription — no per-token API billing. Reconnect any time to switch accounts."
                : "Connect a ChatGPT subscription so Argus can write fixes with Codex. You'll get a one-time code to approve from any browser — nothing to copy onto the server."}
            </p>
            {login?.state === "error" && (
              <div className="fault">login failed — {login.message}</div>
            )}
            {login?.state === "success" && !connected && (
              <p className="muted" style={{ fontSize: 12 }}>Login finished — waiting for credentials to appear…</p>
            )}
            <Btn kind={connected ? "" : "primary"} icon="key" onClick={() => void act(api.codexConnect)}>
              {connected ? "Reconnect Codex" : "Connect Codex"}
            </Btn>
          </>
        )}

        {status && pending && login?.state === "pending" && (
          <>
            <p className="section-label">Approve this sign-in</p>
            {login.code ? (
              <div
                className="mono"
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  color: "var(--gold)",
                  background: "var(--inset)",
                  border: "1px solid var(--gold-dim)",
                  borderRadius: 12,
                  padding: "16px 0",
                  textAlign: "center",
                  marginBottom: 14,
                }}
              >
                {login.code}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 12 }}>waiting for the one-time code…</p>
            )}
            {login.url && (
              <p style={{ fontSize: 13, margin: "0 0 14px" }}>
                Open <a href={login.url} target="_blank" rel="noopener noreferrer">{login.url}</a> on any device, sign in
                to ChatGPT, and enter the code. This page updates by itself.
              </p>
            )}
            {!login.code && !login.url && login.raw && (
              <pre style={{ fontSize: 11, color: "var(--ink-2)", whiteSpace: "pre-wrap", background: "var(--inset)", borderRadius: 8, padding: 12 }}>{login.raw}</pre>
            )}
            <div className="reason-banner a" style={{ marginBottom: 14 }}>
              <span className="rb-ic"><Icon name="alert" size={16} /></span>
              <div className="rb-s">
                On a ChatGPT Business/Enterprise workspace, an admin must first enable{" "}
                <b>"Allow device code login"</b> (Workspace Settings → Permissions). Personal Plus/Pro accounts enable it
                under their own security settings.
              </div>
            </div>
            <div className="row gap6" style={{ color: "var(--gold)", fontSize: 12, marginBottom: 14 }}>
              <span className="dot a"></span> waiting for approval…
            </div>
            <Btn sm onClick={() => void act(api.codexCancel)}>Cancel</Btn>
          </>
        )}
      </div>
    </div>
  );
}

export function Connections({ connection }: { connection: Connection }) {
  const repoCount = connection.installations.reduce((n, i) => n + i.repositories.length, 0);
  return (
    <div className="cfg">
      <div className="panel panel-pad">
        <div className="app-card">
          <div className="app-logo"><EyeMark size={28} stroke={6} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="serif ac-name" style={{ fontSize: 18, fontWeight: 600 }}>{connection.slug ?? "argus"}</span>
              <span className="badge g"><span className="dot g"></span>connected</span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              GitHub App · {connection.installations.length} installation{connection.installations.length === 1 ? "" : "s"} · {repoCount} repos under watch · source: {connection.source}
            </div>
          </div>
          {connection.htmlUrl && (
            <a href={connection.htmlUrl} target="_blank" rel="noopener noreferrer"><Btn icon="link">Manage on GitHub</Btn></a>
          )}
        </div>
      </div>

      <CodexCard />

      <div className="panel">
        <div className="panel-head"><h3>Feature gates</h3><span className="muted" style={{ fontSize: 12 }}>Set via environment</span></div>
        <div className="panel-pad" style={{ paddingTop: 6, paddingBottom: 6 }}>
          {GATE_INFO.map((g) => (
            <div className="kv" key={g.key} style={{ padding: "14px 0" }}>
              <span className="k col" style={{ alignItems: "flex-start", gap: 3 }}>
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>{g.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{g.desc}</span>
              </span>
              <span className={"gatechip " + (connection.gates[g.key] ? "on" : "off")}>
                {connection.gates[g.key] ? "enabled" : "disabled"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Repositories under watch</h3>
          <span className="muted" style={{ fontSize: 12 }}>{repoCount} active</span>
        </div>
        <div className="panel-pad" style={{ paddingTop: 4 }}>
          {connection.installations.map((inst) => (
            <div key={inst.installationId}>
              {inst.repositories.map((r) => (
                <div className="repo-row" key={r.fullName}>
                  <span className="dot g"></span>
                  <span className="rr-name">{r.fullName}</span>
                  <span className="rr-right">
                    {r.private && <span className="muted" style={{ fontSize: 11 }}>private</span>}
                    <span className="label-tag">{r.triggerLabel}</span>
                  </span>
                </div>
              ))}
            </div>
          ))}
          {repoCount === 0 && <p className="muted" style={{ fontSize: 13 }}>App created, but not installed on any repository yet.</p>}
          {connection.installUrl && (
            <div className="mt16">
              <a href={connection.installUrl} target="_blank" rel="noopener noreferrer"><Btn icon="plus">Connect more repositories</Btn></a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
