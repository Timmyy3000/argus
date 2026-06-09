import type { DiscoveryCommands } from "../discovery/types";
import { splitCommand, runCommand } from "../system/command";

export type ValidationCommandResult = {
  name: keyof DiscoveryCommands;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ValidationRunResult = {
  passed: boolean;
  summary: string;
  results: ValidationCommandResult[];
};

export async function runValidationCommands(
  cwd: string,
  commands: DiscoveryCommands,
  timeoutMs = 10 * 60_000,
): Promise<ValidationRunResult> {
  const ordered = ["install", "typecheck", "lint", "test"] as const;
  const results: ValidationCommandResult[] = [];

  for (const name of ordered) {
    const command = commands[name];
    if (!command) continue;
    const { executable, args } = splitCommand(command);
    const result = await runCommand(executable, args, { cwd, timeoutMs });
    results.push({ name, command, ...result });
    if (result.exitCode !== 0) {
      return {
        passed: false,
        summary: `${name} failed with exit code ${result.exitCode}`,
        results,
      };
    }
  }

  return {
    passed: true,
    summary: results.length === 0 ? "No validation commands were discovered" : "Validation commands passed",
    results,
  };
}

