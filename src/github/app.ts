import { App } from "@octokit/app";
import { loadConfig } from "../config";

export function createGitHubApp() {
  const config = loadConfig();
  if (!config.GITHUB_APP_ID || !config.GITHUB_PRIVATE_KEY) {
    return null;
  }

  return new App({
    appId: config.GITHUB_APP_ID,
    privateKey: config.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n"),
  });
}

export async function createInstallationOctokit(installationId: number) {
  const app = createGitHubApp();
  if (!app) {
    throw new Error("GitHub App credentials are not configured");
  }
  return app.getInstallationOctokit(installationId);
}

