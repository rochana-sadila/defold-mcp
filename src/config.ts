import path from "node:path";
import fs from "node:fs";

export function assertInsideRoot(root: string, target: string): string {
  const resolved = path.resolve(root, target);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path "${target}" escapes the project root.`);
  }
  return resolved;
}

export interface DefoldConfig {
  projectRoot: string;
  bobJar: string | undefined;
  dmengineHeadless: string | undefined;
}

let cachedConfig: DefoldConfig | undefined;

export function projectRoot(): string {
  return getConfig().projectRoot;
}

export function getConfig(): DefoldConfig {
  if (cachedConfig) return cachedConfig;

  const root = process.env.DEFOLD_PROJECT_PATH || process.cwd();
  let resolvedRoot: string;
  try {
    resolvedRoot = fs.realpathSync(root);
  } catch {
    throw new Error(
      `Defold project root "${root}" does not exist. Set DEFOLD_PROJECT_PATH to a valid Defold project directory.`
    );
  }

  cachedConfig = {
    projectRoot: resolvedRoot,
    bobJar: resolveBobJar(resolvedRoot, /* throwOnMissing */ false),
    dmengineHeadless: resolveDmengineHeadless(/* throwOnMissing */ false),
  };
  return cachedConfig;
}

export function resolveBobJar(
  root: string = getConfig().projectRoot,
  throwOnMissing: boolean = true
): string | undefined {
  const fromEnv = process.env.BOB;
  const candidates: string[] = [];
  if (fromEnv) candidates.push(fromEnv);
  candidates.push(path.join(root, ".defold", "bob.jar"));

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (throwOnMissing) {
    throw new Error(
      `bob.jar not found. Set the BOB environment variable to the path of bob.jar, ` +
        `or place it at "${path.join(root, ".defold", "bob.jar")}".`
    );
  }
  return undefined;
}

export function resolveDmengineHeadless(
  throwOnMissing: boolean = true
): string | undefined {
  const fromEnv = process.env.DMENGINE_HEADLESS;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const names =
    process.platform === "win32"
      ? ["dmengine_headless.exe", "dmengine_headless"]
      : ["dmengine_headless"];

  const pathEnv = process.env.PATH || "";
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  if (throwOnMissing) {
    throw new Error(
      `dmengine_headless not found. Set the DMENGINE_HEADLESS environment variable to the path of ` +
        `the headless engine binary, or ensure it is available on your PATH.`
    );
  }
  return fromEnv || undefined;
}
