import type { JobDetail, JobSummary } from "./types";

/* Maps real job data onto the design's state & pipeline vocabulary. */

export type ConsoleState = "queued" | "running" | "needs-human" | "failed" | "cancelled" | "completed";
export type Column = "inflight" | "needs" | "resolved";
export type Tone = "g" | "r" | "a" | "q";

export const STATE_META: Record<ConsoleState, { label: string; dot: string; tone: Tone; col: Column }> = {
  queued: { label: "Queued", dot: "q", tone: "q", col: "inflight" },
  running: { label: "Running", dot: "a", tone: "a", col: "inflight" },
  "needs-human": { label: "Needs a human", dot: "r", tone: "r", col: "needs" },
  failed: { label: "Failed", dot: "r", tone: "r", col: "needs" },
  cancelled: { label: "Cancelled", dot: "x", tone: "q", col: "needs" },
  completed: { label: "Completed", dot: "g", tone: "g", col: "resolved" },
};

const FAILURE_STATUSES = new Set([
  "rejected",
  "discovery_failed",
  "implementation_failed",
  "validation_failed",
  "review_failed",
  "publish_failed",
  "timed_out",
]);

export function consoleState(status: string): ConsoleState {
  if (status === "received" || status === "queued") return "queued";
  if (status === "running") return "running";
  if (status === "needs_human") return "needs-human";
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "completed";
  if (FAILURE_STATUSES.has(status)) return "failed";
  return "queued";
}

export function jobsByColumn(jobs: JobSummary[]): Record<Column, JobSummary[]> {
  const cols: Record<Column, JobSummary[]> = { inflight: [], needs: [], resolved: [] };
  for (const job of jobs) cols[STATE_META[consoleState(job.status)].col].push(job);
  return cols;
}

export function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 30_000) return "now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/* ---------------- pipeline stages ---------------- */

export type StageStatus = "done" | "active" | "fail" | "skip" | "pending";
export type Stage = { key: string; label: string; status: StageStatus; reason: string };

const STAGE_DEFS = [
  { key: "triage", label: "Triage" },
  { key: "fix", label: "Fix · Codex" },
  { key: "baseline", label: "Baseline validation" },
  { key: "postfix", label: "Post-fix validation" },
  { key: "review", label: "Review gate" },
  { key: "publish", label: "Publish" },
] as const;

type Loose = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Derives the six-station pipeline story from the artifacts each stage left
 * behind (triage rows, validation rows, review rows, publish decision). A
 * stage with no artifact is pending while the job is alive, skipped once it
 * has settled; the first pending stage of a running job is "active".
 */
export function deriveStages(job: JobDetail): Stage[] {
  const state = consoleState(job.status);
  const settled = state !== "queued" && state !== "running";

  const triage = (job.triage[0] ?? null) as Loose | null;
  const baseline = (job.validations.find((v) => !(v as Loose & { details?: Loose }).details?.afterCodex) ?? null) as Loose | null;
  const postfix = (job.validations.find((v) => (v as Loose & { details?: Loose }).details?.afterCodex) ?? null) as Loose | null;
  const review = (job.reviews[0] ?? null) as Loose | null;

  const stages: Stage[] = STAGE_DEFS.map((d) => ({ key: d.key, label: d.label, status: "pending", reason: "" }));
  const [sTriage, sFix, sBaseline, sPostfix, sReview, sPublish] = stages as [Stage, Stage, Stage, Stage, Stage, Stage];

  if (triage) {
    const decision = str(triage.decision);
    sTriage.status = decision === "attempt" ? "done" : "fail";
    sTriage.reason = [str(triage.source) && `(${str(triage.source)})`, str(triage.reasoning)].filter(Boolean).join(" ");
  }
  if (baseline) {
    sBaseline.status = baseline.passed ? "done" : "fail";
    sBaseline.reason = str(baseline.summary);
  }
  if (postfix) {
    sPostfix.status = postfix.passed ? "done" : "fail";
    sPostfix.reason = str(postfix.summary);
    // Post-fix artifacts only exist after Codex ran and produced something.
    sFix.status = "done";
    sFix.reason = "Codex produced a patch.";
  }
  if (review) {
    sReview.status = review.passed ? "done" : "fail";
    sReview.reason = str(review.summary);
    if (sFix.status === "pending") {
      sFix.status = "done";
      sFix.reason = "Codex produced a patch.";
    }
  }
  if (job.publishDecision) {
    sPublish.status = job.publishDecision === "no_pr" ? "fail" : "done";
    sPublish.reason = job.publishReason ?? "";
  } else if (job.pullRequest) {
    sPublish.status = "done";
    sPublish.reason = `Opened PR #${job.pullRequest.number}.`;
  }
  if (state === "completed") {
    // A completed job cleared every station even where no artifact remains.
    for (const s of stages) if (s.status === "pending") s.status = "done";
  }

  // Direct failure statuses pin the failing station.
  if (job.status === "implementation_failed" && sFix.status === "pending") {
    sFix.status = "fail";
    sFix.reason = job.statusReason ?? "";
  }
  if (job.status === "review_failed" && sReview.status === "pending") {
    sReview.status = "fail";
    sReview.reason = job.statusReason ?? "";
  }
  if (job.status === "publish_failed") {
    sPublish.status = "fail";
    sPublish.reason = job.statusReason ?? "";
  }

  let failed = false;
  let activeAssigned = false;
  for (const s of stages) {
    if (s.status === "fail") failed = true;
    else if (s.status === "pending") {
      if (failed || settled) {
        s.status = "skip";
      } else if (state === "running" && !activeAssigned) {
        s.status = "active";
        activeAssigned = true;
      }
    }
  }
  return stages;
}

export function reasonTone(state: ConsoleState): Tone {
  return STATE_META[state].tone;
}

export const REASON_ICON: Record<Tone, string> = { g: "check", r: "alert", a: "refresh", q: "clock" };

/* validation command rows for the panel */
export type CmdResult = { cmd: string; result: "pass" | "fail"; detail: string };

export function validationCommands(validation: Loose | null): CmdResult[] {
  if (!validation) return [];
  const details = validation.details as Loose | undefined;
  const results = details?.results;
  if (!Array.isArray(results)) return [];
  return results.map((r) => {
    const row = r as Loose;
    const exitCode = typeof row.exitCode === "number" ? row.exitCode : 1;
    return {
      cmd: str(row.command) || "(command)",
      result: exitCode === 0 ? "pass" : "fail",
      detail: exitCode === 0 ? "exit 0" : `exit ${exitCode}`,
    };
  });
}
