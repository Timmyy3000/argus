import { runCommand, type CommandOptions, type CommandResult } from "../system/command";

export type ExecutionMode = "host" | "docker";

export type ExecutorConfig = {
  mode: ExecutionMode;
  image: string;
  repoDir: string;
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
}): string[] {
  const dockerArgs = [
    "run",
    "--rm",
    "--network",
    "none",
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
