import { createInstallationOctokit } from "./app";

export async function createPullRequest(input: {
  installationId: number;
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body: string;
  draft: boolean;
}) {
  const octokit = await createInstallationOctokit(input.installationId);
  const response = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner: input.owner,
    repo: input.repo,
    title: input.title,
    head: input.head,
    base: input.base,
    body: input.body,
    draft: input.draft,
  });

  return {
    githubId: response.data.id,
    number: response.data.number,
    url: response.data.html_url,
  };
}

