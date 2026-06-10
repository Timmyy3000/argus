import { runCommand, type CommandOptions, type CommandResult } from "../system/command";

export type ExecutionMode = "host" | "docker";
export type SandboxNetwork = "none" | "bridge";

export type SandboxLimits = {
  memory: string;
  cpus: string;
  pids: number;
};

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  memory: "2g",
  cpus: "2",
  pids: 512,
};

export type ExecutorConfig = {
  mode: ExecutionMode;
  image: string;
  repoDir: string;
  /**
   * Dependency installs and Codex both need egress, so bridge is the default.
   * Use none for repositories whose validation must run fully offline.
   */
  network?: SandboxNetwork;
  limits?: SandboxLimits;
};

export interface CommandExecutor {
  run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>;
}

export class HostExecutor implements CommandExecutor {
  run(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
    return runCommand(command, args, options);
  }
}

export class DockerExecutor implements CommandExecutor {
  constructor(private readonly config: ExecutorConfig) {}

  run(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
    const dockerArgs = buildDockerRunArgs({
      image: this.config.image,
      repoDir: this.config.repoDir,
      command,
      args,
      network: this.config.network ?? "bridge",
      limits: this.config.limits ?? DEFAULT_SANDBOX_LIMITS,
      ...(options.env ? { env: options.env } : {}),
    });
    const { cwd: _cwd, ...dockerOptions } = options;
    return runCommand("docker", dockerArgs, dockerOptions);
  }
}

export function createCommandExecutor(config: ExecutorConfig): CommandExecutor {
  if (config.mode === "docker") return new DockerExecutor(config);
  return new HostExecutor();
}

export function buildDockerRunArgs(input: {
  image: string;
  repoDir: string;
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  network?: SandboxNetwork;
  limits?: SandboxLimits;
}): string[] {
  const limits = input.limits ?? DEFAULT_SANDBOX_LIMITS;
  const dockerArgs = [
    "run",
    "--rm",
    "--network",
    input.network ?? "bridge",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    limits.memory,
    "--cpus",
    limits.cpus,
    "--pids-limit",
    String(limits.pids),
    "-v",
    `${input.repoDir}:/workspace`,
    "-w",
    "/workspace",
  ];

  for (const [key, value] of Object.entries(input.env ?? {})) {
    if (value !== undefined) dockerArgs.push("-e", `${key}=${value}`);
  }

  dockerArgs.push(input.image, input.command, ...input.args);
  return dockerArgs;
}
