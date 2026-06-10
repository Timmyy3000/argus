import { createInstallationOctokit } from "./app";

export type PermissionFetcher = (input: {
  installationId: number;
  owner: string;
  repo: string;
  username: string;
}) => Promise<{ permission?: string; roleName?: string | null } | null>;

export const fetchCollaboratorPermission: PermissionFetcher = async (input) => {
  const octokit = await createInstallationOctokit(input.installationId);
  const response = await octokit.request("GET /repos/{owner}/{repo}/collaborators/{username}/permission", {
    owner: input.owner,
    repo: input.repo,
    username: input.username,
  });
  return {
    permission: response.data.permission,
    roleName: (response.data as { role_name?: string }).role_name ?? null,
  };
};

/**
 * Normalizes GitHub's permission API answer to the role vocabulary used by
 * repository policies (admin | maintain | write | triage | read). role_name is
 * preferred because the legacy permission field collapses maintain into write.
 */
export function normalizePermission(input: { permission?: string; roleName?: string | null } | null): string | undefined {
  if (!input) return undefined;
  const role = input.roleName ?? input.permission;
  if (!role || role === "none") return undefined;
  return role;
}

/**
 * Resolves what the webhook sender may do in the repository. The repository
 * owner is trusted without a lookup; everyone else is checked against the
 * collaborator permission API. Lookup failures resolve to undefined, which the
 * policy layer treats as not allowed.
 */
export async function resolveSenderPermission(input: {
  installationId: number;
  owner: string;
  repo: string;
  senderLogin: string;
  fetcher?: PermissionFetcher;
}): Promise<string | undefined> {
  if (input.senderLogin === input.owner) return "admin";

  const fetcher = input.fetcher ?? fetchCollaboratorPermission;
  try {
    const result = await fetcher({
      installationId: input.installationId,
      owner: input.owner,
      repo: input.repo,
      username: input.senderLogin,
    });
    return normalizePermission(result);
  } catch {
    return undefined;
  }
}
