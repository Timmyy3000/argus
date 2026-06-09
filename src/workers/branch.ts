export function issueBranchName(issueNumber: number): string {
  return `resolver/issue-${issueNumber}`;
}

export function prTitle(issueNumber: number, issueTitle: string): string {
  return `Fix #${issueNumber}: ${issueTitle}`;
}

