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
    "Resolver accepted this issue for an automated bug-fix attempt.",
    "",
    `Job: \`${jobId}\``,
    "",
    "I will comment again when the job completes or needs human attention.",
  ].join("\n");
}

export function rejectionComment(reason: string): string {
  return [
    "Resolver did not start an automated bug-fix attempt.",
    "",
    `Reason: ${reason}`,
  ].join("\n");
}
