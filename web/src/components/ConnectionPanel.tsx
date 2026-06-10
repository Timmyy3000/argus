import type { Connection } from "../types";

const GATE_LABELS: Array<{ key: keyof Connection["gates"]; label: string }> = [
  { key: "triage", label: "triage" },
  { key: "codex", label: "codex" },
  { key: "llmReview", label: "review" },
  { key: "gitPush", label: "push" },
];

export function ConnectionPanel({ connection }: { connection: Connection }) {
  const repoCount = connection.installations.reduce((sum, inst) => sum + inst.repositories.length, 0);

  return (
    <aside className="panel">
      <h3 className="panel-title">Watch post</h3>

      <div className="panel-block">
        <span className="panel-label">github app</span>
        {connection.htmlUrl ? (
          <a href={connection.htmlUrl} target="_blank" rel="noreferrer" className="panel-value link">
            {connection.slug ?? "configured"}
          </a>
        ) : (
          <span className="panel-value">{connection.configured ? `configured (${connection.source})` : "—"}</span>
        )}
      </div>

      <div className="panel-block">
        <span className="panel-label">gates</span>
        <div className="gates">
          {GATE_LABELS.map(({ key, label }) => (
            <span key={key} className={`gate-chip ${connection.gates[key] ? "gate-open" : "gate-shut"}`}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="panel-block">
        <span className="panel-label">
          repositories under watch <em>({repoCount})</em>
        </span>
        {connection.installations.map((installation) => (
          <div key={installation.installationId} className="install">
            <span className="install-account">@{installation.accountLogin}</span>
            <ul className="repo-list">
              {installation.repositories.map((repo) => (
                <li key={repo.fullName}>
                  <span className="repo-name">{repo.fullName}</span>
                  <code className="repo-label">{repo.triggerLabel}</code>
                </li>
              ))}
              {installation.repositories.length === 0 && <li className="repo-empty">no repositories yet</li>}
            </ul>
          </div>
        ))}
        {connection.installations.length === 0 && (
          <p className="panel-hint">App created, but not installed anywhere yet.</p>
        )}
      </div>

      {connection.installUrl && (
        <a className="panel-button" href={connection.installUrl} target="_blank" rel="noreferrer">
          + Connect more repositories
        </a>
      )}
    </aside>
  );
}
