import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";

const OUTPUT_CAP = 32_000;

export interface SandboxExecutionOptions {
  root: string;
  slug: string;
  command: string;
  timeoutMs: number;
  env?: Record<string, string>;
}

export interface SandboxResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  driver: string;
}

export interface SandboxDriver {
  name: string;
  isAvailable(): boolean;
  execute(options: SandboxExecutionOptions): Promise<SandboxResult>;
}

class UnavailableSandboxDriver implements SandboxDriver {
  name = "unavailable";

  isAvailable(): boolean {
    return false;
  }

  async execute(): Promise<SandboxResult> {
    throw new Error("Computer execution is disabled because no usable sandbox is available.");
  }
}

function getBwrapBaseArgs(): string[] {
  const args: string[] = ["--ro-bind", "/usr", "/usr"];
  for (const dir of ["/bin", "/lib", "/lib64", "/sbin", "/lib32", "/libx32"]) {
    if (!fs.existsSync(dir)) continue;
    try {
      const stat = fs.lstatSync(dir);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(dir);
        args.push("--symlink", target, dir);
      } else if (stat.isDirectory()) {
        args.push("--ro-bind", dir, dir);
      }
    } catch {
      // Ignore directory check failures
    }
  }
  if (fs.existsSync("/etc/resolv.conf")) {
    args.push("--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf");
  }
  return args;
}

/**
 * Bubblewrap (bwrap) unprivileged Linux namespace sandbox driver.
 * Provides instant (<1ms) kernel-enforced filesystem and process isolation.
 */
export class BwrapDriver implements SandboxDriver {
  name = "bwrap";

  isAvailable(): boolean {
    if (process.platform !== "linux") return false;
    try {
      const baseArgs = getBwrapBaseArgs();
      const result = spawnSync("bwrap", [
        ...baseArgs,
        "--proc", "/proc",
        "--dev", "/dev",
        "--tmpfs", "/tmp",
        "--unshare-all",
        "--die-with-parent",
        "/usr/bin/true",
      ], { stdio: "ignore", timeout: 3000 });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  execute(options: SandboxExecutionOptions): Promise<SandboxResult> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      // Construct bwrap isolation arguments
      const baseArgs = getBwrapBaseArgs();
      const args: string[] = [
        ...baseArgs,
        "--proc", "/proc",
        "--dev", "/dev",
        "--tmpfs", "/tmp",
        "--bind", options.root, options.root,
        "--chdir", options.root,
        "--unshare-all",
        "--die-with-parent",
        "bash", "-c", options.command,
      ];

      const child = spawn("bwrap", args, {
        cwd: options.root,
        env: {
          PATH: process.env.PATH || "/usr/bin:/bin",
          HOME: options.root,
          LANG: "C.UTF-8",
          TERM: "dumb",
          ...(options.env || {}),
        } as unknown as NodeJS.ProcessEnv,
        signal: AbortSignal.timeout(options.timeoutMs),
      });

      const take = (chunk: Buffer, current: string) => {
        return (current + chunk.toString("utf8")).slice(-OUTPUT_CAP);
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = take(chunk, stdout);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = take(chunk, stderr);
      });
      child.on("error", (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
      child.on("close", (code: number | null) => {
        if (settled) return;
        settled = true;
        resolve({ exitCode: code, stdout, stderr, driver: "bwrap" });
      });
    });
  }
}

/**
 * Docker container sandbox driver.
 * Provides complete container boundary isolation with isolated network.
 */
export class DockerDriver implements SandboxDriver {
  name = "docker";

  isAvailable(): boolean {
    try {
      const result = spawnSync("docker", ["--version"], { stdio: "ignore" });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  execute(options: SandboxExecutionOptions): Promise<SandboxResult> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      const args = [
        "run", "--rm", "-i",
        "--network", "none",
        "-v", `${options.root}:${options.root}`,
        "-w", options.root,
        "alpine:latest",
        "/bin/sh", "-c", options.command,
      ];

      const child = spawn("docker", args, {
        signal: AbortSignal.timeout(options.timeoutMs),
      });

      const take = (chunk: Buffer, current: string) => {
        return (current + chunk.toString("utf8")).slice(-OUTPUT_CAP);
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = take(chunk, stdout);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = take(chunk, stderr);
      });
      child.on("error", (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
      child.on("close", (code: number | null) => {
        if (settled) return;
        settled = true;
        resolve({ exitCode: code, stdout, stderr, driver: "docker" });
      });
    });
  }
}

/**
 * Direct process execution fallback driver for environments without bwrap or docker.
 */
export class DirectFallbackDriver implements SandboxDriver {
  name = "direct";

  isAvailable(): boolean {
    return true;
  }

  execute(options: SandboxExecutionOptions): Promise<SandboxResult> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      const child = spawn("bash", ["-c", options.command], {
        cwd: options.root,
        env: {
          PATH: process.env.PATH || "/usr/bin:/bin",
          HOME: options.root,
          LANG: "C.UTF-8",
          TERM: "dumb",
          ...(options.env || {}),
        } as unknown as NodeJS.ProcessEnv,
        signal: AbortSignal.timeout(options.timeoutMs),
      });

      const take = (chunk: Buffer, current: string) => {
        return (current + chunk.toString("utf8")).slice(-OUTPUT_CAP);
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = take(chunk, stdout);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = take(chunk, stderr);
      });
      child.on("error", (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
      child.on("close", (code: number | null) => {
        if (settled) return;
        settled = true;
        resolve({ exitCode: code, stdout, stderr, driver: "direct" });
      });
    });
  }
}

export function getSandboxDriver(): SandboxDriver {
  const preferred = (process.env.CUBES_SANDBOX_DRIVER || "auto").trim().toLowerCase();

  const bwrap = new BwrapDriver();
  const docker = new DockerDriver();
  const direct = new DirectFallbackDriver();

  if (preferred === "bwrap" && bwrap.isAvailable()) return bwrap;
  if (preferred === "docker" && docker.isAvailable()) return docker;
  if (preferred === "direct" && process.env.CUBES_ALLOW_UNSAFE_DIRECT === "true") return direct;

  // Auto-detection priority: bwrap -> docker. Never silently run on the host.
  if (bwrap.isAvailable()) return bwrap;
  if (docker.isAvailable()) return docker;
  return new UnavailableSandboxDriver();
}
