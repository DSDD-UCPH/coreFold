import type { Vec3 } from "../domain/types";

const SKIP = new Set([".", "?", ""]);

export type ParsedStructure = {
  plddt: number[];
  ca: Array<Vec3 | null>;
  sequence: string;
};

export function parseMmcifCaAndPlddt(text: string): ParsedStructure {
  const loopIndex = findAtomSiteLoop(text);
  if (loopIndex < 0) {
    throw new Error("mmCIF file does not contain an atom_site loop");
  }
  const { headers, rows } = readLoop(text, loopIndex);
  const atom = indexOf(headers, "label_atom_id");
  const seqId = indexOf(headers, "label_seq_id");
  const comp = indexOf(headers, "label_comp_id");
  const x = indexOf(headers, "Cartn_x");
  const y = indexOf(headers, "Cartn_y");
  const z = indexOf(headers, "Cartn_z");
  const b = indexOf(headers, "B_iso_or_equiv");
  const group = headers.indexOf("_atom_site.group_PDB");

  const residues = new Map<number, { aa: string; ca: Vec3 | null; plddt: number | null }>();
  for (const row of rows) {
    if (group >= 0 && row[group] !== "ATOM" && row[group] !== "HETATM") continue;
    const pos = Number(row[seqId]);
    if (!Number.isFinite(pos) || pos < 1) continue;
    const current = residues.get(pos) ?? { aa: threeToOne(row[comp]), ca: null, plddt: null };
    if (row[atom] === "CA") {
      current.ca = { x: Number(row[x]), y: Number(row[y]), z: Number(row[z]) };
      current.plddt = Number(row[b]);
      current.aa = threeToOne(row[comp]);
    }
    residues.set(pos, current);
  }

  const max = Math.max(...residues.keys());
  const plddt: number[] = [];
  const ca: Array<Vec3 | null> = [];
  let sequence = "";
  for (let i = 1; i <= max; i += 1) {
    const residue = residues.get(i);
    sequence += residue?.aa ?? "X";
    plddt.push(residue?.plddt ?? Number.NaN);
    ca.push(residue?.ca ?? null);
  }
  return { plddt, ca, sequence };
}

function findAtomSiteLoop(text: string): number {
  const marker = "\nloop_";
  let from = 0;
  while (from < text.length) {
    const idx = text.indexOf(marker, from);
    const alt = from === 0 && text.startsWith("loop_") ? 0 : idx;
    const start = alt === 0 && text.startsWith("loop_") ? 0 : idx;
    if (start < 0) return -1;
    const headerStart = start === 0 ? 5 : start + marker.length;
    const slice = text.slice(headerStart, headerStart + 400);
    if (slice.includes("_atom_site.")) {
      return start === 0 ? 0 : start + 1;
    }
    from = headerStart + 1;
  }
  return -1;
}

function readLoop(text: string, loopPos: number): { headers: string[]; rows: string[][] } {
  const after = text.slice(text.indexOf("loop_", loopPos) + 5);
  const lines = after.split(/\r?\n/);
  const headers: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (line.startsWith("_")) {
      headers.push(line.split(/\s+/)[0]);
      i += 1;
      continue;
    }
    break;
  }
  const rows: string[][] = [];
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#") || line.startsWith("loop_") || line.startsWith("data_")) break;
    if (line.startsWith("_")) break;
    rows.push(tokenize(line));
    i += 1;
  }
  return { headers, rows };
}

function tokenize(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current || SKIP.has(current)) {
        if (current) out.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) out.push(current);
  return out;
}

function indexOf(headers: string[], suffix: string): number {
  const idx = headers.findIndex((header) => header === `_atom_site.${suffix}`);
  if (idx < 0) {
    throw new Error(`mmCIF atom_site loop is missing ${suffix}`);
  }
  return idx;
}

const AA: Record<string, string> = {
  ALA: "A",
  ARG: "R",
  ASN: "N",
  ASP: "D",
  CYS: "C",
  GLN: "Q",
  GLU: "E",
  GLY: "G",
  HIS: "H",
  ILE: "I",
  LEU: "L",
  LYS: "K",
  MET: "M",
  PHE: "F",
  PRO: "P",
  SER: "S",
  THR: "T",
  TRP: "W",
  TYR: "Y",
  VAL: "V",
  SEC: "U",
  PYL: "O",
  ASX: "B",
  GLX: "Z",
  XLE: "J",
  UNK: "X",
};

function threeToOne(code: string): string {
  return AA[code] ?? "X";
}
