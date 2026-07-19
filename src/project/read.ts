import fs from "node:fs";
import { assertInsideRoot, projectRoot } from "../config.js";

export interface GameProjectData {
  [section: string]: { [key: string]: string };
}

export function parseGameProject(content: string): GameProjectData {
  const result: GameProjectData = {};
  let currentSection = "";

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("#") || line.startsWith(";")) continue;

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!result[currentSection]) result[currentSection] = {};
      continue;
    }

    const kvMatch = line.match(/^([^=]+)=(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      if (!result[currentSection]) result[currentSection] = {};
      result[currentSection][key] = value;
    }
  }

  return result;
}

export function getProjectRoot(): string {
  return projectRoot();
}

export function readProjectFile(relativePath: string): string {
  const absolute = assertInsideRoot(projectRoot(), relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  return fs.readFileSync(absolute, "utf8");
}
