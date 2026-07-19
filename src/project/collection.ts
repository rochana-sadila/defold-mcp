import fs from "node:fs";
import path from "node:path";
import { getConfig, assertInsideRoot } from "../config.js";

export type Scalar = string | number | boolean;

export interface Node {
  key: string;
  value: Scalar | Node[];
}

export type Doc = Node[];

const INDENT = "  ";

function escapeString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function unescapeString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

interface Token {
  type: "key" | "colon" | "lbrace" | "rbrace" | "string" | "bare";
  value: string;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];

    if (c === "#") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      i++;
      continue;
    }
    if (c === "{") {
      tokens.push({ type: "lbrace", value: "{" });
      i++;
      continue;
    }
    if (c === "}") {
      tokens.push({ type: "rbrace", value: "}" });
      i++;
      continue;
    }
    if (c === ":") {
      tokens.push({ type: "colon", value: ":" });
      i++;
      continue;
    }
    if (c === '"') {
      i++;
      let str = "";
      while (i < n) {
        const ch = text[i];
        if (ch === "\\") {
          if (i + 1 >= n) {
            str += "\\";
            i++;
            break;
          }
          const next = text[i + 1];
          if (next === "n") str += "\n";
          else if (next === "t") str += "\t";
          else if (next === '"') str += '"';
          else if (next === "\\") str += "\\";
          else str += next;
          i += 2;
          continue;
        }
        if (ch === '"') {
          i++;
          break;
        }
        str += ch;
        i++;
      }
      tokens.push({ type: "string", value: str });
      continue;
    }

    let word = "";
    while (i < n) {
      const ch = text[i];
      if (
        ch === " " || ch === "\t" || ch === "\r" || ch === "\n" ||
        ch === "{" || ch === "}" || ch === ":" || ch === "#" || ch === '"'
      ) {
        break;
      }
      word += ch;
      i++;
    }
    tokens.push({ type: "bare", value: word });
  }
  return tokens;
}

function parseScalar(raw: string): Scalar {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw !== "" && !isNaN(Number(raw))) return Number(raw);
  return raw;
}

export function parseCollection(text: string): Doc {
  const tokens = tokenize(text);
  const root: Doc = [];
  const stack: Node[][] = [root];
  let i = 0;

  while (i < tokens.length) {
    const keyTok = tokens[i];
    if (keyTok.type !== "key" && keyTok.type !== "string" && keyTok.type !== "bare") {
      throw new Error(`Expected key at token index ${i}, got ${keyTok.type}`);
    }
    const key = keyTok.value;
    i++;

    // A colon between key and value is optional: Defold files commonly use
    // "key {" for blocks and "key: value" for scalars.
    if (tokens[i] && tokens[i].type === "colon") {
      i++;
    }

    const valTok = tokens[i];
    if (!valTok) {
      throw new Error(`Expected value after "${key}"`);
    }

    const current = stack[stack.length - 1];

    if (valTok.type === "lbrace") {
      i++;
      const block: Node[] = [];
      current.push({ key, value: block });
      stack.push(block);
    } else if (valTok.type === "string") {
      i++;
      current.push({ key, value: valTok.value });
    } else if (valTok.type === "bare") {
      i++;
      current.push({ key, value: parseScalar(valTok.value) });
    } else if (valTok.type === "rbrace") {
      throw new Error(`Unexpected '}' after key "${key}"`);
    } else {
      throw new Error(`Unexpected token type ${valTok.type} for value of "${key}"`);
    }

    while (i < tokens.length && tokens[i].type === "rbrace") {
      if (stack.length <= 1) {
        throw new Error("Unexpected '}' with no open block");
      }
      stack.pop();
      i++;
    }
  }

  if (stack.length !== 1) {
    throw new Error("Unbalanced braces: not all blocks were closed");
  }

  return root;
}

function serializeScalar(value: Scalar): string {
  if (typeof value === "string") {
    return `"${escapeString(value)}"`;
  }
  return String(value);
}

export function serializeCollection(doc: Doc): string {
  const lines: string[] = [];

  function walk(nodes: Node[], depth: number): void {
    const indent = INDENT.repeat(depth);
    for (const node of nodes) {
      if (Array.isArray(node.value)) {
        lines.push(`${indent}${node.key} {`);
        walk(node.value, depth + 1);
        lines.push(`${indent}}`);
      } else {
        lines.push(`${indent}${node.key}: ${serializeScalar(node.value)}`);
      }
    }
  }

  walk(doc, 0);
  return lines.join("\n") + "\n";
}

export function parseEmbeddedData(dataStr: string): Doc {
  return parseCollection(dataStr);
}

export function serializeEmbeddedData(doc: Doc): string {
  return serializeCollection(doc);
}

export function findNode(doc: Doc, key: string, idValue?: string): Node | undefined {
  for (const node of doc) {
    if (node.key !== key) continue;
    if (idValue === undefined) return node;
    if (!Array.isArray(node.value)) continue;
    const idChild = node.value.find(
      (c) => c.key === "id" && typeof c.value === "string" && c.value === idValue
    );
    if (idChild) return node;
  }
  return undefined;
}

function findChild(node: Node, key: string): Node | undefined {
  if (!Array.isArray(node.value)) return undefined;
  return node.value.find((c) => c.key === key);
}

function componentsData(scriptPath?: string): string {
  if (!scriptPath) return "";
  const inner = `components {\n  id: "script"\n  component: "${escapeString(scriptPath)}"\n}\n`;
  return inner;
}

function cloneValue(value: Scalar | Node[]): Scalar | Node[] {
  if (Array.isArray(value)) {
    return value.map((c) => ({ key: c.key, value: cloneValue(c.value) }));
  }
  return value;
}

function cloneDoc(doc: Doc): Doc {
  return doc.map((n) => ({ key: n.key, value: cloneValue(n.value) }));
}

export function addGameObject(
  doc: Doc,
  opts: { id: string; scriptPath?: string; position?: [number, number, number] }
): Doc {
  const next = cloneDoc(doc);
  const [px, py, pz] = opts.position ?? [0, 0, 0];

  const children: Node[] = [
    { key: "id", value: opts.id },
    {
      key: "position",
      value: [
        { key: "x", value: px },
        { key: "y", value: py },
        { key: "z", value: pz },
      ],
    },
    { key: "data", value: componentsData(opts.scriptPath) },
  ];

  next.push({ key: "embedded_instances", value: children });
  return next;
}

export function addComponent(
  doc: Doc,
  opts: { gameObjectId: string; componentId: string; componentPath: string }
): Doc {
  const next = cloneDoc(doc);
  const go = findNode(next, "embedded_instances", opts.gameObjectId);
  if (!go || !Array.isArray(go.value)) {
    throw new Error(`Game object "${opts.gameObjectId}" not found`);
  }

  let dataStr = "";
  const dataNode = findChild(go, "data");
  if (dataNode && typeof dataNode.value === "string") {
    dataStr = dataNode.value;
  }

  const subDoc = dataStr ? parseEmbeddedData(dataStr) : [];
  subDoc.push({
    key: "components",
    value: [
      { key: "id", value: opts.componentId },
      { key: "component", value: opts.componentPath },
    ],
  });
  const newData = serializeEmbeddedData(subDoc);

  if (dataNode) {
    dataNode.value = newData;
  } else {
    go.value.push({ key: "data", value: newData });
  }
  return next;
}

export function setProperty(
  doc: Doc,
  opts: { gameObjectId: string; key: string; value: string }
): Doc {
  const next = cloneDoc(doc);
  const go = findNode(next, "embedded_instances", opts.gameObjectId);
  if (!go || !Array.isArray(go.value)) {
    throw new Error(`Game object "${opts.gameObjectId}" not found`);
  }

  const existing = findChild(go, opts.key);
  if (existing) {
    existing.value = opts.value;
  } else {
    go.value.push({ key: opts.key, value: opts.value });
  }
  return next;
}

export function readCollectionFile(relativePath: string): Doc {
  const absolute = assertInsideRoot(getConfig().projectRoot, relativePath);
  const content = fs.readFileSync(absolute, "utf8");
  return parseCollection(content);
}

export function writeCollectionFile(relativePath: string, doc: Doc): void {
  const absolute = assertInsideRoot(getConfig().projectRoot, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, serializeCollection(doc), "utf8");
}

export function unifiedDiff(oldText: string, newText: string, label?: string): string {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const a = oldLines;
  const b = newLines;
  const n = a.length;
  const m = b.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }

  const out: string[] = [];
  const header = label ? `--- ${label}\n+++ ${label}` : "";
  if (header) out.push(header);

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(`- ${a[i]}`);
      i++;
    } else {
      out.push(`+ ${b[j]}`);
      j++;
    }
  }
  while (i < n) {
    out.push(`- ${a[i]}`);
    i++;
  }
  while (j < m) {
    out.push(`+ ${b[j]}`);
    j++;
  }

  return out.join("\n") + "\n";
}
