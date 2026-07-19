export interface TestResult {
  name: string;
  status: "pass" | "fail";
  message?: string;
}

export interface TestSummary {
  passed: number;
  failed: number;
  details: TestResult[];
}

const PASS_RE = /^PASS:\s*(.+)$/i;
const FAIL_RE = /^FAIL:\s*(.+?)(?::\s*(.*))?$/i;

export function parseTestOutput(log: string): TestSummary {
  const details: TestResult[] = [];

  for (const line of log.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const passMatch = PASS_RE.exec(trimmed);
    if (passMatch) {
      details.push({ name: passMatch[1].trim(), status: "pass" });
      continue;
    }

    const failMatch = FAIL_RE.exec(trimmed);
    if (failMatch) {
      const name = failMatch[1].trim();
      const message = failMatch[2]?.trim();
      details.push({
        name,
        status: "fail",
        ...(message ? { message } : {}),
      });
      continue;
    }
  }

  const passed = details.filter((d) => d.status === "pass").length;
  const failed = details.filter((d) => d.status === "fail").length;

  return { passed, failed, details };
}
