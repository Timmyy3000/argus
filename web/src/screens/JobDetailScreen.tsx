import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { JobDetail } from "../types";
import {
  consoleState,
  deriveStages,
  REASON_ICON,
  relTime,
  STATE_META,
  validationCommands,
  type CmdResult,
  type Stage,
} from "../derive";
import { Btn, Icon } from "../ui";

function StageNode({ status, idx }: { status: Stage["status"]; idx: number }) {
  if (status === "done") return <Icon name="check" size={14} />;
  if (status === "fail") return <Icon name="x" size={14} />;
  if (status === "skip") return <Icon name="minus" size={13} />;
  if (status === "active") return <span className="dot a" style={{ width: 9, height: 9 }}></span>;
  return <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{idx + 1}</span>;
}

function StageRail({ stages }: { stages: Stage[] }) {
  return (
    <div className="stagerail">
      {stages.map((s, i) => (
        <div key={s.key} className={"srow " + s.status}>
          <div className="snode"><StageNode status={s.status} idx={i} /></div>
          <div className="s-body">
            <div className="s-name">{s.label}</div>
            {s.reason && <div className="s-reason">{s.reason}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CmdRow({ c }: { c: CmdResult }) {
  return (
    <div className="cmd">
      <span className="cmd-t"><b>$</b> {c.cmd}</span>
      <span className={"gatechip " + (c.result === "pass" ? "pass" : "fail")}>
        {c.result === "pass" ? "passed" : `failed · ${c.detail}`}
      </span>
    </div>
  );
}

function ValidationPanel({ job }: { job: JobDetail }) {
  type Loose = Record<string, unknown>;
  const baseline = (job.validations.find((v) => !((v as Loose).details as Loose | undefined)?.afterCodex) ?? null) as Loose | null;
  const postfix = (job.validations.find((v) => ((v as Loose).details as Loose | undefined)?.afterCodex) ?? null) as Loose | null;
  if (!baseline && !postfix) return null;
  const rows = (v: Loose | null) => {
    const cmds = validationCommands(v);
    if (!v) return <p className="muted" style={{ fontSize: 12 }}>— not reached —</p>;
    if (!cmds.length) return <p className="muted" style={{ fontSize: 12 }}>{String(v.summary ?? "no command details")}</p>;
    return cmds.map((c, i) => <CmdRow key={i} c={c} />);
  };
  return (
    <div className="panel">
      <div className="panel-head"><h3>Validation</h3><Icon name="flask" size={16} /></div>
      <div className="panel-pad">
        <p className="section-label">Baseline (before fix)</p>
        {rows(baseline)}
        <p className="section-label" style={{ marginTop: 18 }}>Post-fix (after patch)</p>
        {rows(postfix)}
      </div>
    </div>
  );
}

function ReviewPanel({ job, gates }: { job: JobDetail; gates: Record<string, boolean> | null }) {
  type Loose = Record<string, unknown>;
  const review = (job.reviews[0] ?? null) as Loose | null;
  return (
    <div className="panel">
      <div className="panel-head"><h3>Review gates</h3><Icon name="shield" size={16} /></div>
      <div className="panel-pad">
        {review ? (
          <>
            <div className="kv">
              <span className="k">Review verdict</span>
              <span className={"gatechip " + (review.passed ? "pass" : "fail")}>{review.passed ? "passed" : "blocked"}</span>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--ink-2)", margin: "12px 0 0" }}>{String(review.summary ?? "")}</p>
            {Array.isArray(review.blockers) && review.blockers.length > 0 && (
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--red)" }}>
                {(review.blockers as string[]).map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
          </>
        ) : (
          <>
            {gates &&
              ([
                ["Triage", gates.triage],
                ["Codex", gates.codex],
                ["Review", gates.llmReview],
                ["Push", gates.gitPush],
              ] as const).map(([name, on]) => (
                <div className="kv" key={name}>
                  <span className="k">{name}</span>
                  <span className={"gatechip " + (on ? "on" : "off")}>{on ? "enabled" : "disabled"}</span>
                </div>
              ))}
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>No verdict recorded yet — the diff hasn't reached the review gate.</p>
          </>
        )}
      </div>
    </div>
  );
}

function PrPanel({ pr }: { pr: JobDetail["pullRequest"] }) {
  if (!pr) return null;
  return (
    <div className="panel">
      <div className="panel-head"><h3>Pull request</h3><Icon name="pr" size={16} /></div>
      <div className="panel-pad">
        <a href={pr.url} target="_blank" rel="noopener noreferrer" className="serif" style={{ fontSize: 16, fontWeight: 600 }}>
          #{pr.number}{pr.draft ? " · draft" : ""}
        </a>
        <div className="mt16">
          <a href={pr.url} target="_blank" rel="noopener noreferrer"><Btn kind="primary" sm icon="arrowRight">Open on GitHub</Btn></a>
        </div>
      </div>
    </div>
  );
}

function Attempts({ attempts }: { attempts: JobDetail["attempts"] }) {
  const [open, setOpen] = useState(attempts.length - 1);
  if (!attempts.length) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Attempt history</h3>
        <span className="muted" style={{ fontSize: 12 }}>{attempts.length} attempt{attempts.length > 1 ? "s" : ""}</span>
      </div>
      <div className="panel-pad" style={{ paddingBottom: 12 }}>
        {attempts.map((a, i) => {
          const isOpen = open === i;
          const tone = a.status === "completed" ? "g" : a.status === "running" ? "a" : "r";
          return (
            <div className="attempt" key={a.id}>
              <button className="attempt-head" onClick={() => setOpen(isOpen ? -1 : i)}>
                <span className={"chev" + (isOpen ? " open" : "")}><Icon name="chevron" size={14} /></span>
                <span className="at-n">Attempt {a.attemptNumber}</span>
                <span className="at-meta">
                  <span className="muted">{a.workerId ?? "—"}</span>
                  <span className={"badge " + tone}><span className={"dot " + (tone === "g" ? "g" : tone === "a" ? "a" : "r")}></span>{a.status}</span>
                </span>
              </button>
              {isOpen && (
                <div className="attempt-body">
                  <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)" }}>
                    {a.error ?? `Started ${relTime(a.startedAt)} ago${a.finishedAt ? `, finished ${relTime(a.finishedAt)} ago` : ""}.`}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LogStream({ logs, live }: { logs: JobDetail["logs"]; live: boolean }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (el && live) el.scrollTop = el.scrollHeight;
  }, [logs.length, live]);
  return (
    <div className="logwrap">
      <div className="logbar">
        <span>Log · {logs.length} lines</span>
        {live && <span className="row gap6" style={{ color: "var(--gold)" }}><span className="dot a"></span> streaming</span>}
      </div>
      <div className="logbody" ref={bodyRef}>
        {logs.length === 0 && <div className="logline"><span className="lk">—</span><span className="lt muted">no log lines yet</span></div>}
        {logs.map((l, i) => (
          <div key={i} className={"logline " + l.stream}>
            <span className="lk">{l.stream}</span>
            <span className="lt">
              {l.redactedContent}
              {live && i === logs.length - 1 ? <span className="cursor-blink"></span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JobDetailScreen({
  jobId,
  gates,
  onBack,
}: {
  jobId: string;
  gates: Record<string, boolean> | null;
  onBack: () => void;
}) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.job(jobId).then(
        (j) => { if (alive) { setJob(j); setError(null); } },
        (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); },
      );
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => { alive = false; clearInterval(id); };
  }, [jobId]);

  if (error) return <div className="fault">console fault — {error}</div>;
  if (!job) return <div className="empty"><p>fetching the job…</p></div>;

  const state = consoleState(job.status);
  const m = STATE_META[state];
  const live = state === "running";
  const stages = deriveStages(job);

  return (
    <div className="detail">
      <div className="det-head">
        <button className="det-back" onClick={onBack}><Icon name="arrowLeft" size={15} /> All jobs</button>
        <div className="det-titlerow">
          <div>
            <div className="repo">{job.repository} · issue #{job.issueNumber}</div>
            <h1>{job.issueTitle || `Issue #${job.issueNumber}`}</h1>
            <div className="det-meta">
              <span className="label-tag">{job.triggerLabel}</span>
              <span className={"badge " + m.tone}><span className={"dot " + m.dot}></span>{m.label}</span>
              <span className="sep"></span>
              <span>attempt {job.currentAttempt || "—"}/{job.maxAttempts}</span>
              <span className="sep"></span>
              <span>requested by {job.requestedBy}</span>
              <span className="sep"></span>
              <span>updated {relTime(job.updatedAt)}</span>
            </div>
          </div>
          <div className="det-actions">
            {job.pullRequest && (
              <a href={job.pullRequest.url} target="_blank" rel="noopener noreferrer">
                <Btn icon="pr">View PR #{job.pullRequest.number}</Btn>
              </a>
            )}
          </div>
        </div>
      </div>

      {job.statusReason && (
        <div className={"reason-banner " + m.tone}>
          <span className="rb-ic"><Icon name={REASON_ICON[m.tone]} size={18} /></span>
          <div>
            <div className="rb-t">{m.label}</div>
            <div className="rb-s">{job.statusReason}</div>
          </div>
        </div>
      )}

      <div className="det-grid">
        <div className="col gap16">
          <div className="panel">
            <div className="panel-head">
              <h3>Pipeline</h3>
              {live && <span className="row gap6" style={{ color: "var(--gold)", fontSize: 12 }}><span className="dot a"></span> live</span>}
            </div>
            <div className="panel-pad"><StageRail stages={stages} /></div>
          </div>
          <Attempts attempts={job.attempts} />
          <LogStream logs={job.logs} live={live} />
        </div>
        <div className="col gap16">
          <ValidationPanel job={job} />
          <ReviewPanel job={job} gates={gates} />
          <PrPanel pr={job.pullRequest} />
        </div>
      </div>
    </div>
  );
}
