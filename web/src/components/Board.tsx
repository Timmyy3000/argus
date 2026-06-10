import type { JobSummary } from "../types";

type Lane = { key: string; title: string; sub: string; statuses: (status: string) => boolean };

const LANES: Lane[] = [
  {
    key: "inflight",
    title: "In flight",
    sub: "queued and running attempts",
    statuses: (s) => ["received", "queued", "running"].includes(s),
  },
  {
    key: "attention",
    title: "Needs a human",
    sub: "triaged out, gate-blocked, or failed",
    statuses: (s) =>
      ["needs_human", "rejected", "cancelled", "timed_out"].includes(s) || s.endsWith("_failed"),
  },
  {
    key: "resolved",
    title: "Resolved",
    sub: "pull request opened",
    statuses: (s) => s === "completed",
  },
];

function statusTone(status: string): string {
  if (status === "completed") return "ok";
  if (["received", "queued", "running"].includes(status)) return "live";
  return "warn";
}

export function Board({ jobs, onSelect }: { jobs: JobSummary[]; onSelect: (id: string) => void }) {
  return (
    <section className="board">
      {LANES.map((lane) => {
        const laneJobs = jobs.filter((job) => lane.statuses(job.status));
        return (
          <div key={lane.key} className={`lane lane-${lane.key}`}>
            <header className="lane-head">
              <h2>{lane.title}</h2>
              <span className="lane-count">{laneJobs.length}</span>
            </header>
            <p className="lane-sub">{lane.sub}</p>
            <div className="lane-cards">
              {laneJobs.map((job, index) => (
                <button
                  key={job.id}
                  className="card"
                  style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}
                  onClick={() => onSelect(job.id)}
                >
                  <div className="card-top">
                    <span className={`dot dot-${statusTone(job.status)}`} />
                    <span className="card-repo">{job.repository}</span>
                  </div>
                  <div className="card-issue">issue #{job.issueNumber}</div>
                  <div className="card-meta">
                    <code className="card-status">{job.status.replace(/_/g, " ")}</code>
                    <span className="card-when">{timeAgo(job.updatedAt)}</span>
                  </div>
                </button>
              ))}
              {laneJobs.length === 0 && <div className="lane-empty">— nothing here —</div>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
