const DEFAULT_SECRET_PATTERNS = [
  /ghs_[A-Za-z0-9_]+/g,
  /ghp_[A-Za-z0-9_]+/g,
  /github_pat_[A-Za-z0-9_]+/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /OPENAI_API_KEY=([^\s]+)/g,
  /GITHUB_TOKEN=([^\s]+)/g,
];

export function redactSecrets(input: string, additionalSecrets: string[] = []): string {
  let output = input;
  for (const secret of additionalSecrets.filter(Boolean)) {
    output = output.split(secret).join("[REDACTED]");
  }
  for (const pattern of DEFAULT_SECRET_PATTERNS) {
    output = output.replace(pattern, "[REDACTED]");
  }
  return output;
}

