import { useCallback, useEffect, useState } from "react";
import { api, ApiError, consumeTokenFromUrl } from "./api";
import type { Connection, JobSummary } from "./types";
import { consoleState, STATE_META } from "./derive";
import { Btn, EyeMark, Icon } from "./ui";
import { Board } from "./screens/Board";
import { Connections } from "./screens/Connections";
import { JobDetailScreen } from "./screens/JobDetailScreen";
import { Standards } from "./screens/Standards";
import { FirstRun, SignIn } from "./screens/CenterPages";

consumeTokenFromUrl();

const POLL_MS = 5000;

const NAV = [
  { key: "jobs", label: "Jobs", icon: "grid" },
  { key: "connections", label: "Connections", icon: "plug" },
  { key: "standards", label: "Standards", icon: "book" },
] as const;

type Route = (typeof NAV)[number]["key"];

function nowStr() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function App() {
  const [needsToken, setNeedsToken] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [route, setRoute] = useState<Route>("jobs");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [synced, setSynced] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [conn, jobsResult] = await Promise.all([api.connection(), api.jobs()]);
      setConnection(conn);
      setJobs(jobsResult.jobs);
      setSynced(nowStr());
      setNeedsToken(false);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setNeedsToken(true);
      else setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (needsToken) {
    return (
      <div className="cons">
        <SignIn onSignIn={() => void refresh()} />
      </div>
    );
  }

  if (connection && !connection.configured) {
    return (
      <div className="cons">
        <FirstRun />
      </div>
    );
  }

  const goTo = (r: Route) => { setRoute(r); setSelectedId(null); };
  const needsCount = jobs.filter((j) => STATE_META[consoleState(j.status)].col === "needs").length;
  const runningCount = jobs.filter((j) => consoleState(j.status) === "running").length;
  const selectedJob = selectedId ? jobs.find((j) => j.id === selectedId) : undefined;

  let title = "Jobs";
  let crumb = `The watch · ${connection?.slug ?? "argus"}`;
  let content;
  if (route === "jobs" && selectedId) {
    title = "Job";
    crumb = selectedJob ? `${selectedJob.repository} · #${selectedJob.issueNumber}` : "job detail";
    content = <JobDetailScreen jobId={selectedId} gates={connection?.gates ?? null} onBack={() => setSelectedId(null)} />;
  } else if (route === "jobs") {
    content = <Board jobs={jobs} onOpen={setSelectedId} onGoConnections={() => goTo("connections")} />;
  } else if (route === "connections") {
    title = "Connections";
    crumb = "GitHub App · gates · repos";
    content = connection ? <Connections connection={connection} /> : null;
  } else {
    title = "Standards";
    crumb = "AGENTS.md · skills";
    content = <Standards />;
  }

  const navItems = (
    <>
      {NAV.map((n) => (
        <button key={n.key} className={"c-nav-item" + (route === n.key ? " active" : "")} onClick={() => goTo(n.key)}>
          <span className="ni-ic"><Icon name={n.icon} size={18} /></span>
          <span className="c-nav-label">{n.label}</span>
          {n.key === "jobs" && needsCount > 0 && <span className="ni-badge">{needsCount}</span>}
        </button>
      ))}
    </>
  );

  return (
    <div className="cons">
      <div className="c-shell">
        <aside className="c-side">
          <div className="c-brand"><EyeMark size={26} live stroke={6} /><span className="wm">Argus</span></div>
          <nav className="c-nav">{navItems}</nav>
          <div className="c-side-foot">
            <div className="row">
              <span className={"dot " + (connection?.configured ? "g" : "q")}></span>
              <span>{connection?.slug ?? "not connected"}</span>
            </div>
            <div className="muted">{jobs.length} jobs · {runningCount} running</div>
          </div>
        </aside>

        <div className="c-main">
          <header className="c-topbar">
            <div className="c-title">
              <h1>{title}</h1>
              <span className="crumb">{crumb}</span>
            </div>
            <div className="c-tb-right">
              {connection?.installUrl && route === "jobs" && !selectedId && (
                <a href={connection.installUrl} target="_blank" rel="noopener noreferrer"><Btn sm icon="plus">Connect repos</Btn></a>
              )}
              <span className="c-sync">
                <span className={"blip" + (error ? " err" : "")}></span>
                {error ? "sync fault" : synced ? `synced ${synced}` : "syncing…"}
              </span>
            </div>
          </header>
          <div className="c-content">
            {error && <div className="fault">console fault — {error}</div>}
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
