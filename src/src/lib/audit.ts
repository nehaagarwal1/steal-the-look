// Retailer Dupe Audit: does a cheaper shade really look like the premium one,
// on real people's lips? Pure logic (no browser/server APIs), unit-tested.
//
// For every (shade pair × test face): both shades are tried on that face, the
// lips are measured, and the on-face difference (CIEDE2000) decides the cell.

import { deltaE2000, hexToLab } from "@/lib/color";
import type { LipTexture } from "@/data/catalog";
import { catalog, type LipProduct } from "@/data/catalog";
import { SOURCE_LABEL, type FaceSource } from "@/lib/synthetic-faces";

export type AuditShade = { name: string; hex: string; texture: LipTexture; price: number };
export type ShadePair = { id: string; premium: AuditShade; dupe: AuditShade };

/** One test face: an anonymous label, its natural (bare) lip color, and whether it's AI-generated or a real volunteer. */
export type AuditFace = { label: string; naturalLipHex: string; source?: FaceSource };

/** "Face A (synthetic)" / "Face B (real volunteer)". Older reports without a source show just "Face A". */
export const faceTitle = (f: AuditFace) => `Face ${f.label}${f.source ? ` (${SOURCE_LABEL[f.source]})` : ""}`;

/** "4 synthetic, 1 real volunteer" */
export function faceMix(faces: AuditFace[]): string {
  const n = (s: FaceSource) => faces.filter((f) => f.source === s).length;
  const parts = [n("synthetic") && `${n("synthetic")} synthetic`, n("real") && `${n("real")} real volunteer${n("real") > 1 ? "s" : ""}`].filter(Boolean);
  return parts.length ? parts.join(", ") : `${faces.length} faces`;
}

/** Measured lip colors of both shades of a pair on one face. */
export type AuditMeasurement = { pairId: string; face: string; premiumHex: string; dupeHex: string };

export const TRUE_DUPE = 4; // same threshold as the shopper flow
export const CLOSE = 7;

export type CellVerdict = "true dupe" | "close" | "different";

export function cellVerdict(deltaE: number): CellVerdict {
  return deltaE < TRUE_DUPE ? "true dupe" : deltaE < CLOSE ? "close" : "different";
}

// --- Shade pairs ------------------------------------------------------------

const TEXTURES: LipTexture[] = ["matte", "gloss", "satin", "sheer", "shimmer", "metallic", "holographic"];
const CSV_HEADER = ["premium_name", "premium_hex", "premium_texture", "premium_price", "dupe_name", "dupe_hex", "dupe_texture", "dupe_price"];

/** Example CSV: two real catalog pairs, so the template always matches the catalog's colors and prices. */
export function csvTemplate(): string {
  const rows = catalogPairs(["berry", "coral"]).map((pr) => [
    pr.premium.name, pr.premium.hex, pr.premium.texture, pr.premium.price, pr.dupe.name, pr.dupe.hex, pr.dupe.texture, pr.dupe.price,
  ].join(","));
  return [CSV_HEADER.join(","), ...rows].join("\n") + "\n";
}

/** Splits one CSV line, honoring double quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim()); cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Parses the retailer's shade-pair CSV. Returns pairs plus readable errors per bad row. */
export function parseShadeCsv(text: string): { pairs: ShadePair[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  if (!lines.length) return { pairs: [], errors: ["The file is empty."] };
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const missing = CSV_HEADER.filter((h) => !header.includes(h));
  if (missing.length) return { pairs: [], errors: [`Missing columns: ${missing.join(", ")}. Download the template to see the format.`] };
  const col = (row: string[], name: string) => row[header.indexOf(name)] ?? "";

  const pairs: ShadePair[] = [];
  lines.slice(1).forEach((line, i) => {
    const row = splitCsvLine(line);
    const rowNo = i + 2;
    const shade = (side: "premium" | "dupe"): AuditShade | string => {
      const name = col(row, `${side}_name`);
      const hex = col(row, `${side}_hex`).toUpperCase();
      const texture = col(row, `${side}_texture`).toLowerCase() as LipTexture;
      const price = Number(col(row, `${side}_price`));
      if (!name) return `${side} name is empty`;
      if (!/^#[0-9A-F]{6}$/.test(hex)) return `${side} color "${hex}" isn't a hex color like #7B2D4F`;
      if (!TEXTURES.includes(texture)) return `${side} finish "${texture}" must be one of ${TEXTURES.join(", ")}`;
      if (!Number.isFinite(price) || price < 0) return `${side} price isn't a number`;
      return { name, hex, texture, price };
    };
    const premium = shade("premium"), dupe = shade("dupe");
    if (typeof premium === "string" || typeof dupe === "string") {
      errors.push(`Row ${rowNo}: ${[premium, dupe].filter((x) => typeof x === "string").join("; ")}.`);
      return;
    }
    pairs.push({ id: `csv-${rowNo}`, premium, dupe });
  });
  if (pairs.length > 20) errors.push("Only the first 20 pairs are used per audit.");
  return { pairs: pairs.slice(0, 20), errors };
}

/** Premium vs cheapest version of each catalog family, for audits without a CSV. */
export function catalogPairs(families: string[]): ShadePair[] {
  return families.flatMap((family) => {
    const members = catalog.filter((p): p is LipProduct => p.kind === "lipstick" && p.family === family);
    if (members.length < 2) return [];
    const premium = members.reduce((a, b) => (b.price > a.price ? b : a));
    const dupe = members.reduce((a, b) => (b.price < a.price ? b : a));
    const toShade = (p: LipProduct): AuditShade => ({ name: `${p.name} ${p.shade}`, hex: p.hex, texture: p.texture, price: p.price });
    return [{ id: `cat-${family}`, premium: toShade(premium), dupe: toShade(dupe) }];
  });
}

/** A starter set mixing true dupes and "marketed" dupes, so the report shows both. */
export const DEFAULT_AUDIT_FAMILIES = ["berry", "classic-red", "plum", "mauve", "coral", "blue-red"];

// --- Report -----------------------------------------------------------------

export type AuditCell = { face: string; deltaE: number; verdict: CellVerdict };

export type PairResult = {
  pair: ShadePair;
  cells: AuditCell[];
  passes: number;
  avgDeltaE: number;
  worst?: AuditCell;
  /** Overall call for the pair. */
  verdict: "true dupe on every face" | "true dupe on most faces" | "not a reliable dupe" | "not a dupe";
  /** Pattern in where it fails, e.g. "Fails on deeper natural lip tones." */
  insight?: string;
};

export type AuditReport = { createdAt: string; faces: AuditFace[]; results: PairResult[] };

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Minimum gap (CIEDE2000) between failing and passing faces before we call it a pattern. */
const PATTERN_GAP = 1.5;
/** Minimum natural-lip lightness gap (Lab L) between failing and passing faces. */
const DEPTH_GAP = 5;
/** Cells this close to the true-dupe limit count as borderline. */
const BORDERLINE = 1.2;

/**
 * Explains where a pair fails, only when the data clearly supports it:
 * - borderline: every face is near the true-dupe limit, so there's no real pattern;
 * - lip depth: failing faces are clearly worse AND their natural lips are clearly lighter/deeper.
 */
export function deriveInsight(cells: AuditCell[], faces: AuditFace[]): string | undefined {
  if (cells.length < 2) return undefined;
  const failing = cells.filter((c) => c.verdict !== "true dupe");
  const passing = cells.filter((c) => c.verdict === "true dupe");
  if (failing.length === 0) return undefined;
  if (cells.every((c) => Math.abs(c.deltaE - TRUE_DUPE) <= BORDERLINE)) {
    return "Borderline on every face: close to the true-dupe limit.";
  }
  if (passing.length === 0 || faces.length < 3) return undefined;

  const worstPass = Math.max(...passing.map((c) => c.deltaE));
  const bestFail = Math.min(...failing.map((c) => c.deltaE));
  if (bestFail - worstPass < PATTERN_GAP) return undefined;

  const L = (label: string) => hexToLab(faces.find((f) => f.label === label)!.naturalLipHex).L;
  const failL = failing.map((c) => L(c.face)), passL = passing.map((c) => L(c.face));
  const hedge = faces.length < 5 ? ` (based on ${faces.length} faces: test more to confirm)` : "";
  if (Math.min(...failL) - Math.max(...passL) >= DEPTH_GAP) return `Fails on lighter natural lip tones${hedge}.`;
  if (Math.min(...passL) - Math.max(...failL) >= DEPTH_GAP) return `Fails on deeper natural lip tones${hedge}.`;
  return undefined;
}

function pairVerdict(cells: AuditCell[]): PairResult["verdict"] {
  const passes = cells.filter((c) => c.verdict === "true dupe").length;
  const share = cells.length ? passes / cells.length : 0;
  return cells.length && passes === cells.length ? "true dupe on every face"
    : share >= 0.6 ? "true dupe on most faces"
    : passes > 0 ? "not a reliable dupe"
    : "not a dupe";
}

/** Re-applies the current verdict and insight rules to a saved report's numbers (e.g. the demo report). */
export function refreshReport(report: AuditReport): AuditReport {
  return {
    ...report,
    results: report.results.map((r) => {
      const cells = r.cells.map((c) => ({ ...c, verdict: cellVerdict(c.deltaE) }));
      return { ...r, cells, passes: cells.filter((c) => c.verdict === "true dupe").length, verdict: pairVerdict(cells), insight: deriveInsight(cells, report.faces) };
    }),
  };
}

export function buildAuditReport(pairs: ShadePair[], faces: AuditFace[], measurements: AuditMeasurement[], now = new Date()): AuditReport {
  const results = pairs.map((pair): PairResult => {
    const cells = faces.flatMap((face): AuditCell[] => {
      const m = measurements.find((x) => x.pairId === pair.id && x.face === face.label);
      if (!m) return [];
      const dE = round1(deltaE2000(m.premiumHex, m.dupeHex));
      return [{ face: face.label, deltaE: dE, verdict: cellVerdict(dE) }];
    });
    const passes = cells.filter((c) => c.verdict === "true dupe").length;
    const avgDeltaE = cells.length ? round1(cells.reduce((s, c) => s + c.deltaE, 0) / cells.length) : 0;
    const worst = cells.reduce<AuditCell | undefined>((w, c) => (!w || c.deltaE > w.deltaE ? c : w), undefined);
    return { pair, cells, passes, avgDeltaE, worst, verdict: pairVerdict(cells), insight: deriveInsight(cells, faces) };
  });
  return { createdAt: now.toISOString(), faces, results };
}

/** Spreadsheet export: one row per pair, one column per face. No photos, only numbers and labels. */
export function reportToCsv(report: AuditReport): string {
  const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const head = ["premium", "premium_price", "dupe", "dupe_price", "savings", ...report.faces.map((f) => `face_${f.label}_deltaE`), "true_dupe_faces", "avg_deltaE", "verdict", "insight", "face_sources"];
  const sources = report.faces.map((f) => `${f.label}: ${f.source ? SOURCE_LABEL[f.source] : "unknown"}`).join("; ");
  const rows = report.results.map((r) => [
    r.pair.premium.name, r.pair.premium.price, r.pair.dupe.name, r.pair.dupe.price, r.pair.premium.price - r.pair.dupe.price,
    ...report.faces.map((f) => r.cells.find((c) => c.face === f.label)?.deltaE ?? ""),
    `${r.passes}/${r.cells.length}`, r.avgDeltaE, r.verdict, r.insight ?? "", sources,
  ]);
  return [head, ...rows].map((row) => row.map(esc).join(",")).join("\n") + "\n";
}

/** Anonymous labels for test faces: A, B, C, ... */
export const faceLabel = (i: number) => String.fromCharCode(65 + i);

// --- Catalog exports (to build audit CSVs from the app's own catalog) -------

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csvRow = (cells: (string | number)[]) => cells.map(csvCell).join(",");

/**
 * Every lipstick with its exact color, finish and price, plus how far it is
 * from the premium version of its family in the tube (catalog color, not on a face).
 */
export function catalogToCsv(): string {
  const lips = catalog.filter((p): p is LipProduct => p.kind === "lipstick");
  const premiumOf = new Map<string, LipProduct>();
  for (const p of lips) {
    const key = p.family ?? p.id;
    const cur = premiumOf.get(key);
    if (!cur || p.price > cur.price) premiumOf.set(key, p);
  }
  const head = ["id", "product", "shade", "family", "hex", "texture", "price", "premium_id", "deltaE_vs_premium_in_tube"];
  const rows = lips.map((p) => {
    const premium = premiumOf.get(p.family ?? p.id)!;
    return [p.id, p.name, p.shade, p.family ?? "", p.hex, p.texture, p.price, premium.id, Math.round(deltaE2000(p.hex, premium.hex) * 10) / 10];
  });
  return [csvRow(head), ...rows.map(csvRow)].join("\n") + "\n";
}

/** Premium vs cheapest of every catalog family, in the audit upload format. */
export function allPairsCsv(): string {
  const families = [...new Set(catalog.filter((p): p is LipProduct => p.kind === "lipstick").map((p) => p.family).filter((f): f is string => !!f))];
  const rows = catalogPairs(families).map((pr) => [
    pr.premium.name, pr.premium.hex, pr.premium.texture, pr.premium.price, pr.dupe.name, pr.dupe.hex, pr.dupe.texture, pr.dupe.price,
  ]);
  return [csvRow(CSV_HEADER), ...rows.map(csvRow)].join("\n") + "\n";
}
