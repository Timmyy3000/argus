import { useEffect, useState } from "react";
import { api } from "../api";
import type { JobDetail } from "../types";

type Stage = {
  name: string;
  state: "ok" | "blocked" | "pending" | "skipped";
  detail: string;
};

function deriveStages(job: JobDetail): Stage[] {
  const triage = job.triage[0] as { decision?: string; reasoning?: string; category?: string } | undefined;
  const discovery = job.discovery[0] as { confidence?: string; source?: string } | undefined;
  const validations = job.validations as Array<{ passed?: boolean; summary?: string; details?: { afterCodex?: boolean } }>;
  const baseline = validations.find((v) => !v.details?.afterCodex);
  const post = validations.find((v) => v.details?.afterCodex);
  const review = job.reviews[0] as { passed?: boolean; summary?: string } | undefined;

  const stages: Stage[] = [];

  stages.push(
    triage
      ? {
          name: "triage",
          state: triage.decision === "attempt" ? "ok" : "blocked",
          detail: `${triage.decision ?? "?"} (${triage.category ?? "?"}) — ${triage.reasoning ?? ""}`,
        }
      : { name: "triage", state: "pending", detail: "not reached" },
  );

  stages.push(
    discovery
      ? { name: "discovery", state: "ok", detail: `${discovery.confidence ?? "?"} confidence via ${discovery.source ?? "?"}` }
      : { name: "discovery", state: "pending", detail: "not reached" },
  );

  stages.push(
    baseline
      ? { name: "baseline validation", state: baseline.passed ? "ok" : "blocked", detail: baseline.summary ?? "" }
      : { name: "baseline validation", state: "pending", detail: "not reached" },
  );

  stages.push(
    post
      ? { name: "post-fix validation", state: post.passed ? "ok" : "blocked", detail: post.summary ?? "" }
      : { name: "post-fix validation", state: "pending", detail: "not reached" },
  );

  stages.push(
    review
      ? { name: "review gate", state: review.passed ? "ok" : "blocked", detail: review.summary ?? "" }
      : { name: "review gate", state: "pending", detail: "not reached" },
  );

  stages.push(
    job.publishDecision
      ? {
          name: "publish",
          state: job.publishDecision === "no_pr" ? "blocked" : "ok",
          detail: `${job.publishDecision} — ${job.publishReason ?? ""}`,
        }
      : { name: "publish", state: "pending", detail: "not reached" },
  );

  return stages;
}

export function JobDrawer({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const detail = await api.job(jobId);
        if (!cancelled) setJob(detail);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId]);

  return (
    <div className="drawer-veil" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <button className="drawer-close" onClick={onClose} aria-label="close">
          ×
        </button>

        {error && <p className="hero-error">{error}</p>}
        {!job && !error && <p className="drawer-loading">consulting the eyes…</p>}

        {job && (
          <>
            <header className="drawer-head">
              <span className="drawer-repo">{job.repository}</span>
              <h2 className="drawer-title">issue #{job.issueNumber}</h2>
              <div className="drawer-status-row">
                <code className={`drawer-status status-${job.status === "completed" ? "ok" : job.status === "running" || job.status === "queued" ? "live" : "warn"}`}>
                  {job.status.replace(/_/g, " ")}
                </code>
                <span className="drawer-attempt">
                  attempt {job.currentAttempt}/{job.maxAttempts} · by {job.requestedBy}
                </span>
              </div>
              {job.statusReason && <p className="drawer-reason">{job.statusReason}</p>}
              {job.pullRequest && (
                <a className="drawer-pr" href={job.pullRequest.url} target="_blank" rel="noreferrer">
                  → pull request #{job.pullRequest.number}
                  {job.pullRequest.draft ? " (draft)" : ""}
                </a>
              )}
            </header>

            <section className="drawer-section">
              <h3>Pipeline</h3>
              <ol className="timeline">
                {deriveStages(job).map((stage) => (
                  <li key={stage.name} className={`stage stage-${stage.state}`}>
                    <span className="stage-marker" />
                    <div>
                      <span className="stage-name">{stage.name}</span>
                      <p className="stage-detail">{stage.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="drawer-section">
              <h3>Log</h3>
              <div className="logs">
                {[...job.logs]
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((log) => (
                    <pre key={`${log.sequence}-${log.createdAt}`} className={`log log-${log.stream}`}>
                      <span className="log-stream">{log.stream}</span>
                      {log.redactedContent}
                    </pre>
                  ))}
                {job.logs.length === 0 && <p className="panel-hint">no log output recorded yet</p>}
              </div>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
