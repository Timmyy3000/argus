import type { Db } from "../db/client";
import { appendRedactedLogChunk } from "../domain/attempts";

/** Single log chunks are capped so a noisy test suite cannot bloat the database. */
export const MAX_LOG_CHUNK_CHARS = 64_000;

/**
 * Keeps the head and tail of oversized output: failures usually surface at the end,
 * while the head identifies which command produced it.
 */
export function truncateForLog(content: string, maxChars = MAX_LOG_CHUNK_CHARS): string {
  if (content.length <= maxChars) return content;
  const half = Math.floor((maxChars - 64) / 2);
  const omitted = content.length - half * 2;
  return `${content.slice(0, half)}\n... [${omitted} characters truncated] ...\n${content.slice(-half)}`;
}

/**
 * Appends redacted, sequence-ordered log chunks for one attempt. The launcher reserves
 * sequences 1 and >= 1,000,000 for its own lifecycle messages, so runner logs start at 10.
 */
export class JobLogger {
  private sequence: number;

  constructor(
    private readonly db: Db,
    private readonly jobId: string,
    private readonly attemptId: string,
    private readonly additionalSecrets: string[] = [],
    startSequence = 10,
  ) {
    this.sequence = startSequence;
  }

  async log(stream: "stdout" | "stderr" | "system", content: string): Promise<void> {
    if (!content.trim()) return;
    await appendRedactedLogChunk(this.db, {
      jobId: this.jobId,
      attemptId: this.attemptId,
      sequence: this.sequence,
      stream,
      content: truncateForLog(content),
      additionalSecrets: this.additionalSecrets,
    });
    this.sequence += 1;
  }

  async logCommand(
    label: string,
    result: { exitCode: number; stdout: string; stderr: string },
  ): Promise<void> {
    await this.log("system", `$ ${label} (exit ${result.exitCode})`);
    await this.log("stdout", result.stdout);
    await this.log("stderr", result.stderr);
  }
}
