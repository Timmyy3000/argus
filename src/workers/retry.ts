import type { TerminalJobStatus } from "../domain/attempts";
import type { WorkerRunResult } from "./types";

export type AttemptOutcome =
  | { action: "finish"; jobStatus: TerminalJobStatus }
  | { action: "retry"; reason: string };

export function decideAttemptOutcome(input: {
  result: WorkerRunResult;
  attemptNumber: number;
  maxAttempts: number;
}): AttemptOutcome {
  const { result } = input;

  if (result.status === "completed" || result.status === "needs_human") {
    return { action: "finish", jobStatus: result.status };
  }

  if (result.retryable && input.attemptNumber < input.maxAttempts) {
    return {
      action: "retry",
      reason: `Attempt ${input.attemptNumber} of ${input.maxAttempts} failed with a retryable error: ${result.reason}`,
    };
  }

  return { action: "finish", jobStatus: result.status };
}
