import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const getDirname = () => {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
};

export interface ServiceEntry {
  service: string;
  port: number;
  host: string;
  pid: number;
  url: string;
  metadata?: Record<string, unknown>;
  updated_at: string;
}

export interface RegistryData {
  version: string;
  services: Record<string, ServiceEntry>;
}

export interface AllocateOptions {
  service: string;
  preferred?: number;
  range?: [number, number];
  host?: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export class PortAllocatorClient {
  private registryPath: string;

  constructor(customRegistryPath?: string) {
    if (customRegistryPath) {
      this.registryPath = customRegistryPath;
    } else if (process.env.PORT_REGISTRY_PATH) {
      this.registryPath = process.env.PORT_REGISTRY_PATH;
    } else {
      this.registryPath = path.join(os.homedir(), ".local", "share", "port-registry", "ports.json");
    }
  }

  /**
   * Get path to the registry file.
   */
  getRegistryPath(): string {
    return this.registryPath;
  }

  /**
   * Read current registry entries (synchronously).
   */
  readRegistry(): RegistryData {
    if (!fs.existsSync(this.registryPath)) {
      return { version: "1.0", services: {} };
    }
    try {
      const raw = fs.readFileSync(this.registryPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return { version: "1.0", services: {} };
    }
  }

  /**
   * Allocate a port via CLI or atomic file scan.
   */
  allocate(options: AllocateOptions): number {
    const service = options.service;
    const preferred = options.preferred ?? 3000;
    const host = options.host ?? "127.0.0.1";

    const binCandidates = [
      path.resolve(getDirname(), "..", "bin", "port-alloc"),
      path.join(os.homedir(), ".local", "bin", "port-alloc"),
      "port-alloc",
    ];

    let binPath = "";
    for (const cand of binCandidates) {
      if (cand === "port-alloc") {
        try {
          execSync("which port-alloc 2>/dev/null");
          binPath = "port-alloc";
          break;
        } catch {
          // not found in PATH
        }
      } else if (fs.existsSync(cand)) {
        binPath = cand;
        break;
      }
    }

    if (binPath) {
      let cmd = `"${binPath}" allocate --service "${service}" --preferred ${preferred} --host "${host}"`;
      if (options.range) {
        cmd += ` --range "${options.range[0]}-${options.range[1]}"`;
      }
      if (options.url) {
        cmd += ` --url "${options.url}"`;
      }
      if (options.meta) {
        cmd += ` --meta '${JSON.stringify(options.meta)}'`;
      }
      const output = execSync(cmd, {
        encoding: "utf-8",
        env: { ...process.env, PORT_REGISTRY_PATH: this.registryPath },
      }).trim();
      return parseInt(output, 10);
    }

    // Fallback: return preferred if no binary available
    return preferred;
  }

  /**
   * Query service info.
   */
  get(service: string): ServiceEntry | null {
    const reg = this.readRegistry();
    return reg.services[service] || null;
  }

  /**
   * Release a registered port.
   */
  release(service: string): boolean {
    const reg = this.readRegistry();
    if (reg.services[service]) {
      delete reg.services[service];
      fs.mkdirSync(path.dirname(this.registryPath), { recursive: true });
      fs.writeFileSync(this.registryPath, JSON.stringify(reg, null, 2), "utf-8");
      return true;
    }
    return false;
  }

  /**
   * List all registered services.
   */
  list(): Record<string, ServiceEntry> {
    return this.readRegistry().services;
  }
}

export const defaultPortAllocator = new PortAllocatorClient();
export const allocatePort = (options: AllocateOptions) => defaultPortAllocator.allocate(options);
export const getService = (service: string) => defaultPortAllocator.get(service);
export const releasePort = (service: string) => defaultPortAllocator.release(service);
export const listServices = () => defaultPortAllocator.list();
