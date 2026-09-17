export type GreenFoldOp =
  | { kind: "trunc"; start: number; end: number }
  | { kind: "del"; start: number; end: number; startAA?: string; endAA?: string }
  | { kind: "ins"; after: number; sequence: string }
  | { kind: "sub"; position: number; fromAA?: string; toAA: string }
  | { kind: "chain" };

export type ParsedGreenFold = {
  identifier: string | null;
  ops: GreenFoldOp[];
  raw: string;
};

const IDENTIFIER = /^[A-Za-z0-9_]+/;

export class GreenFoldSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GreenFoldSyntaxError";
  }
}

export function parseGreenFold(raw: string): ParsedGreenFold {
  let text = raw.trim();
  if (/%[0-9A-Fa-f]{2}/.test(text)) {
    try {
      text = decodeURIComponent(text);
    } catch {
      // Keep the original string when it is not valid percent-encoding.
    }
  }
  if (!text) {
    throw new GreenFoldSyntaxError("Empty GreenFold pattern");
  }

  let identifier: string | null = null;
  let body = text;
  const ident = text.match(IDENTIFIER);
  if (ident && text[ident[0].length] !== "[" && !text.includes("[")) {
    return { identifier: ident[0], ops: [], raw: text };
  }
  if (ident && text[ident[0].length] === "[") {
    identifier = ident[0];
    body = text.slice(ident[0].length);
  }
  if (!body.startsWith("[") || !body.endsWith("]")) {
    throw new GreenFoldSyntaxError("Variation pattern must be wrapped in brackets");
  }
  const inner = body.slice(1, -1);
  return { identifier, ops: parseOps(inner), raw: text };
}

function parseOps(inner: string): GreenFoldOp[] {
  if (inner.length === 0) {
    return [];
  }
  const parts = splitTopLevel(inner);
  return parts.map(parseOp);
}

function splitTopLevel(inner: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of inner) {
    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;
    if (depth < 0) {
      throw new GreenFoldSyntaxError("Unbalanced brackets");
    }
    if (depth === 0 && (char === ";" || char === "," || char === "|")) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (depth !== 0) {
    throw new GreenFoldSyntaxError("Unbalanced brackets");
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseOp(token: string): GreenFoldOp {
  if (token.toLowerCase() === "chain") {
    return { kind: "chain" };
  }

  const ins = token.match(/^(\d+)(?:-\d+)?ins\[(.*)\]$/i);
  if (ins) {
    return { kind: "ins", after: Number(ins[1]), sequence: ins[2] };
  }

  const rangeDel = token.match(/^([A-Z])?(\d+)-([A-Z])?(\d+)del$/i);
  if (rangeDel) {
    return {
      kind: "del",
      start: Number(rangeDel[2]),
      end: Number(rangeDel[4]),
      startAA: rangeDel[1]?.toUpperCase(),
      endAA: rangeDel[3]?.toUpperCase(),
    };
  }

  const singleDel = token.match(/^([A-Z])?(\d+)del$/i);
  if (singleDel) {
    const pos = Number(singleDel[2]);
    return {
      kind: "del",
      start: pos,
      end: pos,
      startAA: singleDel[1]?.toUpperCase(),
      endAA: singleDel[1]?.toUpperCase(),
    };
  }

  const trunc = token.match(/^(\d+)-(\d+)trunc$/i);
  if (trunc) {
    return { kind: "trunc", start: Number(trunc[1]), end: Number(trunc[2]) };
  }

  const sub = token.match(/^([A-Z])?(\d+)([A-Z])$/);
  if (sub) {
    return {
      kind: "sub",
      position: Number(sub[2]),
      fromAA: sub[1],
      toAA: sub[3],
    };
  }

  const bareTrunc = token.match(/^(\d+)-(\d+)$/);
  if (bareTrunc) {
    return { kind: "trunc", start: Number(bareTrunc[1]), end: Number(bareTrunc[2]) };
  }

  throw new GreenFoldSyntaxError(`Unrecognized variation operation: ${token}`);
}
