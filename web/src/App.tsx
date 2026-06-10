import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getToken, setToken } from "./api";
import type { Connection, JobSummary } from "./types";
import { Board } from "./components/Board";
import { ConnectHero } from "./components/ConnectHero";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { Eye } from "./components/Eye";
import { JobDrawer } from "./components/JobDrawer";

const POLL_MS = 5000;

export function App() {
  const [needsToken, setNeedsToken] = useState(false);
  const [tokenDraft, setTokenDraft] = useState(getToken());
  const [connection, setConnection] = useState<Connection | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [connectionResult, jobsResult] = await Promise.all([api.connection(), api.jobs()]);
      setConnection(connectionResult);
      setJobs(jobsResult.jobs);
      setLastSync(new Date());
      setNeedsToken(false);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setNeedsToken(true);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  if (needsToken) {
    return (
      <div className="gate">
        <Eye size={64} />
        <h1 className="gate-title">ARGUS</h1>
        <p className="gate-sub">This console is sealed. Present the dashboard token.</p>
        <form
          className="gate-form"
          onSubmit={(event) => {
            event.preventDefault();
            setToken(tokenDraft.trim());
            void refresh();
          }}
        >
          <input
            autoFocus
            type="password"
            value={tokenDraft}
            onChange={(event) => setTokenDraft(event.target.value)}
            placeholder="ARGUS_DASHBOARD_TOKEN"
          />
          <button type="submit">Enter</button>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead-brand">
          <Eye size={36} />
          <div>
            <h1>ARGUS</h1>
            <span className="masthead-tag">the bug-squashing watchman</span>
          </div>
        </div>
        <div className="masthead-meta">
          {connection && (
            <span className={`chip ${connection.configured ? "chip-on" : "chip-off"}`}>
              {connection.configured ? `app: ${connection.slug ?? "configured"}` : "github: not connected"}
            </span>
          )}
          <span className="sync">{lastSync ? `synced ${lastSync.toLocaleTimeString()}` : "syncing…"}</span>
        </div>
      </header>

      {error && <div className="banner-error">console fault — {error}</div>}

      {connection && !connection.configured ? (
        <ConnectHero />
      ) : (
        <main className="layout">
          <Board jobs={jobs} onSelect={setSelectedJobId} />
          {connection && <ConnectionPanel connection={connection} />}
        </main>
      )}

      {selectedJobId && <JobDrawer jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />}
    </div>
  );
}
