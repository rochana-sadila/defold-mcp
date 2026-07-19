export interface BuildIssue {
  file: string;
  line: number | null;
  message: string;
  severity: "error" | "warning";
}

interface PatternSpec {
  regex: RegExp;
  severity: (m: RegExpMatchArray) => "error" | "warning";
  file: (m: RegExpMatchArray) => string;
  line: (m: RegExpMatchArray) => number | null;
  message: (m: RegExpMatchArray) => string;
}

function toSeverity(raw: string | undefined): "error" | "warning" {
  return raw && /^warn/i.test(raw) ? "warning" : "error";
}

const patterns: PatternSpec[] = [
  {
    regex: /^(ERROR|WARNING):[A-Z_]*:\s*(.+?):(\d+):\s*(.*)$/i,
    severity: (m) => toSeverity(m[1]),
    file: (m) => m[2].trim(),
    line: (m) => parseInt(m[3], 10),
    message: (m) => m[4].trim(),
  },
  {
    regex: /^(ERROR|WARNING):\s*(.+?):(\d+):\s*(.*)$/i,
    severity: (m) => toSeverity(m[1]),
    file: (m) => m[2].trim(),
    line: (m) => parseInt(m[3], 10),
    message: (m) => m[4].trim(),
  },
  {
    regex: /^(ERROR|WARNING):[A-Z_]*:\s*(.+?):\s*(.*)$/i,
    severity: (m) => toSeverity(m[1]),
    file: (m) => m[2].trim(),
    line: () => null,
    message: (m) => m[3].trim(),
  },
  {
    regex: /^(error|warning):\s*([^\s]+?):(\d+):\s*(.*)$/i,
    severity: (m) => toSeverity(m[1]),
    file: (m) => m[2].trim(),
    line: (m) => parseInt(m[3], 10),
    message: (m) => m[4].trim(),
  },
  {
    regex: /^(error|warning):\s*([^\s]+?)\((\d+)\):\s*(.*)$/i,
    severity: (m) => toSeverity(m[1]),
    file: (m) => m[2].trim(),
    line: (m) => parseInt(m[3], 10),
    message: (m) => m[4].trim(),
  },
  {
    regex: /^(ERROR|WARNING):\s*(.+)$/i,
    severity: (m) => toSeverity(m[1]),
    file: () => "",
    line: () => null,
    message: (m) => m[2].trim(),
  },
];

const looseFileLine =
  /([^\s]+\.(?:script|go|collection|atlas|tilesource|lua)):(\d+)/i;

function tryStructured(line: string): BuildIssue | null {
  for (const p of patterns) {
    const m = line.match(p.regex);
    if (m) {
      return {
        file: p.file(m),
        line: p.line(m),
        message: p.message(m),
        severity: p.severity(m),
      };
    }
  }
  return null;
}

export function parseBuildErrors(log: string): BuildIssue[] {
  const issues: BuildIssue[] = [];
  const lines = log.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const structured = tryStructured(trimmed);
    if (structured) {
      issues.push(structured);
      continue;
    }

    const loose = trimmed.match(looseFileLine);
    if (loose) {
      const severity: "error" | "warning" = /warn/i.test(trimmed)
        ? "warning"
        : "error";
      issues.push({
        file: loose[1].trim(),
        line: parseInt(loose[2], 10),
        message: trimmed,
        severity,
      });
    }
  }

  return issues;
}
