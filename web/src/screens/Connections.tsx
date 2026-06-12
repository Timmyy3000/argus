import type { Connection } from "../types";
import { Btn, EyeMark } from "../ui";

const GATE_INFO: Array<{ key: keyof Connection["gates"]; name: string; desc: string }> = [
  { key: "triage", name: "Triage", desc: "Decide whether an issue has enough detail to act on (LLM; heuristic fallback when off)." },
  { key: "codex", name: "Codex", desc: "Let Codex write the fix in a sandboxed workspace." },
  { key: "llmReview", name: "Review", desc: "Run an LLM review pass over the diff (mechanical checks always run)." },
  { key: "gitPush", name: "Push", desc: "Allow Argus to push a branch and open a pull request on a clean pass." },
];

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
