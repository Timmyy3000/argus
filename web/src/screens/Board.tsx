import type { JobSummary } from "../types";
import { consoleState, jobsByColumn, relTime, STATE_META } from "../derive";
import { Btn, EyeMark, Progress } from "../ui";

const COLS = [
  { key: "inflight", title: "In flight", sub: "Queued & running" },
  { key: "needs", title: "Needs a human", sub: "Parked, gate-blocked or failed" },
  { key: "resolved", title: "Resolved", sub: "Pull request opened" },
] as const;

function JobCard({ job, onOpen }: { job: JobSummary; onOpen: (id: string) => void }) {
  const state = consoleState(job.status);
  const m = STATE_META[state];
  return (
    <button className="jcard" onClick={() => onOpen(job.id)}>
      <div className="jc-top">
        <span className={"dot " + m.dot}></span>
        <span className="repo">{job.repository}</span>
        <span>· #{job.issueNumber}</span>
        <span style={{ marginLeft: "auto" }}>{relTime(job.updatedAt)}</span>
      </div>
      <div className="jc-title">{job.issueTitle || `Issue #${job.issueNumber}`}</div>

      {state === "running" && (
        <>
          <div className="jc-foot">
            <span className="jc-reason a">working…</span>
            <span>{job.requestedBy}</span>
          </div>
          <Progress indeterminate />
        </>
      )}
      {state === "queued" && (
        <div className="jc-foot">
          <span className="jc-reason">Queued — awaiting worker</span>
          <span>{job.requestedBy}</span>
        </div>
      )}
      {(state === "needs-human" || state === "failed") && (
        <div className="jc-foot">
          <span className="jc-reason r">{m.label}</span>
          <span>{job.status.replace(/_/g, " ")}</span>
        </div>
      )}
      {state === "completed" && (
        <div className="jc-foot">
          <span className="jc-reason g">PR opened</span>
          <span>{relTime(job.updatedAt)}</span>
        </div>
      )}
      {state === "cancelled" && (
        <div className="jc-foot">
          <span className="jc-reason">Cancelled</span>
          <span>{relTime(job.updatedAt)}</span>
        </div>
      )}
    </button>
  );
}

export function Board({ jobs, onOpen, onGoConnections }: { jobs: JobSummary[]; onOpen: (id: string) => void; onGoConnections: () => void }) {
  if (jobs.length === 0) {
    return (
      <div className="empty">
        <div className="eye-wrap"><EyeMark size={56} eyes={1} stroke={4} /></div>
        <h3>The watch is quiet.</h3>
        <p>
          No jobs yet. Drop an <span className="mono" style={{ color: "var(--gold)" }}>agent:fix</span> label on an issue in a
          connected repo and it'll appear here within seconds.
        </p>
        <div className="wrap-actions" style={{ justifyContent: "center" }}>
          <Btn kind="primary" icon="git" onClick={onGoConnections}>View connected repos</Btn>
        </div>
      </div>
    );
  }
  const cols = jobsByColumn(jobs);
  return (
    <div className="board">
      {COLS.map((c) => (
        <div className="bcol" key={c.key}>
          <div className="bcol-head">
            <div className="lhs">
              <h3>{c.title}</h3>
              <span className="ct">{cols[c.key].length}</span>
            </div>
            <span className="sub">{c.sub}</span>
          </div>
          <div className="bcol-body">
            {cols[c.key].length === 0
              ? <div className="bcol-empty">— nothing here —</div>
              : cols[c.key].map((j) => <JobCard key={j.id} job={j} onOpen={onOpen} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
