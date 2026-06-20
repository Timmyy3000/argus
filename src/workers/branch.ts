export function issueBranchName(issueNumber: number): string {
  return `argus/issue-${issueNumber}`;
}

export function prTitle(issueNumber: number, issueTitle: string): string {
  return `Fix #${issueNumber}: ${issueTitle}`;
}

// Commits are authored by Argus so git blame attributes the change to the agent,
// not a fresh-clone anonymous identity. Codex is credited as co-author (the engine).
export const argusGitIdentity = {
  name: "Argus",
  email: "argus@users.noreply.github.com",
} as const;

export function fixCommitMessage(issueNumber: number): string {
  return `Fix issue #${issueNumber}\n\nCo-authored-by: Codex <codex@openai.com>`;
}
