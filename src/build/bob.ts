import { spawn } from "node:child_process";
import { getConfig, resolveBobJar } from "../config.js";

export interface BobBuildOptions {
  variant: "debug" | "release" | "headless";
  archive: boolean;
  timeoutMs?: number;
}

export interface BobBuildResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export function runBobBuild(opts: BobBuildOptions): Promise<BobBuildResult> {
  const timeoutMs = opts.timeoutMs ?? 120000;
  const config = getConfig();
  const bobJar = resolveBobJar(config.projectRoot, /* throwOnMissing */ true);
  if (!bobJar) {
    throw new Error("bob.jar not found.");
  }

  return new Promise<BobBuildResult>((resolve, reject) => {
    const args = [
      "-jar",
      bobJar,
      "resolve",
      "build",
      "--variant",
      opts.variant,
    ];
    if (opts.archive) {
      args.push("--archive");
    }

    const child = spawn("java", args, {
      cwd: config.projectRoot,
      env: process.env,
      detached: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

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
        success: false,
        stdout,
        stderr: `${stderr}\n[bob build timed out after ${timeoutMs}ms and was killed]`.trim(),
        code: null,
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
      resolve({
        success: code === 0,
        stdout,
        stderr,
        code,
      });
    });
  });
}
