import fs from "node:fs";
import path from "node:path";

const INTERESTING_EXTENSIONS = [
  ".collection",
  ".go",
  ".script",
  ".atlas",
  ".tilesource",
];

const SKIP_DIRS = new Set([
  "build",
  ".internal",
  "node_modules",
  ".git",
  "dist",
  ".defold",
]);

export function listProjectTree(root: string, subdir?: string): string {
  const start = subdir ? path.resolve(root, subdir) : path.resolve(root);
  const lines: string[] = [];
  walk(start, root, 0, lines);
  return lines.join("\n");
}

function walk(
  dir: string,
  root: string,
  depth: number,
  lines: string[]
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((a, b) => {
    const aIsDir = a.isDirectory();
    const bIsDir = b.isDirectory();
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const indent = "  ".repeat(depth);
      lines.push(`${indent}${entry.name}/`);
      walk(path.join(dir, entry.name), root, depth + 1, lines);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!INTERESTING_EXTENSIONS.includes(ext)) continue;
      const indent = "  ".repeat(depth);
      lines.push(`${indent}${entry.name}`);
    }
  }
}
