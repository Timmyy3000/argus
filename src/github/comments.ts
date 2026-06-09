import { createInstallationOctokit } from "./app";

export async function createIssueComment(input: {
  installationId: number;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}) {
  const octokit = await createInstallationOctokit(input.installationId);
  return octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
    owner: input.owner,
    repo: input.repo,
    issue_number: input.issueNumber,
    body: input.body,
  });
}

export function acceptedComment(jobId: string): string {
  return [
    "Argus accepted this issue for an automated bug-fix attempt.",
    "",
    `Job: \`${jobId}\``,
    "",
    "I will comment again when the job completes or needs human attention.",
  ].join("\n");
}

export function rejectionComment(reason: string): string {
  return [
    "Argus did not start an automated bug-fix attempt.",
    "",
    `Reason: ${reason}`,
  ].join("\n");
}

export function outcomeComment(input: { status: string; reason: string }): string {
  const heading =
    input.status === "completed"
      ? "Argus completed this automated bug-fix attempt."
      : input.status === "needs_human"
        ? "Argus needs human attention on this bug-fix attempt."
        : "Argus could not complete this automated bug-fix attempt.";

  return [heading, "", `Status: \`${input.status}\``, "", `Reason: ${input.reason}`].join("\n");
}
