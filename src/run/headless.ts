import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { getConfig, resolveDmengineHeadless, assertInsideRoot } from "../config.js";

export interface RunHeadlessOptions {
  variant?: "debug" | "release" | "headless";
  timeoutSec?: number;
  settingsFile?: string;
}

export interface RunHeadlessResult {
  crashed: boolean;
  exitCode: number | null;
  log: string;
  timedOut: boolean;
}

function resolveBuildDir(root: string, variant?: "debug" | "release" | "headless"): string {
  const headlessDir = path.join(root, "build", "headless");
  const debugDir = path.join(root, "build", "debug");

  if (variant === "headless" && fs.existsSync(headlessDir)) {
    return headlessDir;
  }
  if (fs.existsSync(debugDir)) {
    return debugDir;
  }
  if (fs.existsSync(headlessDir)) {
    return headlessDir;
  }
  return debugDir;
}

export function runHeadless(opts: RunHeadlessOptions): Promise<RunHeadlessResult> {
  const config = getConfig();
  const engine = resolveDmengineHeadless(/* throwOnMissing */ true);
  if (!engine) {
    throw new Error("dmengine_headless not found.");
  }
  const buildDir = resolveBuildDir(config.projectRoot, opts.variant);

  const args: string[] = [];
  if (opts.settingsFile) {
    const resolvedSettings = assertInsideRoot(config.projectRoot, opts.settingsFile);
    args.push("--config", resolvedSettings);
  }

  return new Promise<RunHeadlessResult>((resolve, reject) => {
    const child = spawn(engine, args, {
      cwd: buildDir,
      env: process.env,
      detached: true,
    });

    let log = "";

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk: string) => {
      log += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      log += chunk;
    });

    const timeoutMs = (opts.timeoutSec ?? 10) * 1000;

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        if (child.pid !== undefined) {
          process.kill(-child.pid, "SIGKILL");
        }
      } catch {
        /* process group may already be gone */
      }
      try {
        child.kill("SIGKILL");
      } catch {
        /* child may already be gone */
      }
      resolve({
        crashed: false,
        exitCode: null,
        log,
        timedOut: true,
      });
    }, timeoutMs);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const crashed = code !== 0 && code !== null;
      resolve({
        crashed,
        exitCode: code,
        log,
        timedOut: false,
      });
    });
  });
}
