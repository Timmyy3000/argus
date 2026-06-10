import { App } from "@octokit/app";
import { getGitHubAppCredentials } from "./credentials";

export async function createGitHubApp() {
  const credentials = await getGitHubAppCredentials();
  if (!credentials) return null;

  return new App({
    appId: credentials.appId,
    privateKey: credentials.privateKey.replace(/\\n/g, "\n"),
  });
}

export async function createInstallationOctokit(installationId: number) {
  const app = await createGitHubApp();
  if (!app) {
    throw new Error("GitHub App credentials are not configured");
  }
  return app.getInstallationOctokit(installationId);
}

export async function createInstallationToken(installationId: number): Promise<string> {
  const app = await createGitHubApp();
  if (!app) {
    throw new Error("GitHub App credentials are not configured");
  }

  const auth = (await app.octokit.auth({
    type: "installation",
    installationId,
  })) as { token?: string };

  if (!auth.token) {
    throw new Error(`Failed to create installation token for ${installationId}`);
  }

  return auth.token;
}
