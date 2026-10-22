// Pure lip-color measurement: given pixels and a lip mask, return a robust color.
// No browser APIs here, so it is unit-tested in Node.

import { deltaE2000, labToHex, rgbToLab, type Lab } from "@/lib/color";
import { finishFromShine, measureShine, type Finish } from "./finish";

export type Pixels = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };

export type LipMeasurement = {
  hex: string;
  lab: Lab;
  /** Pixels used after trimming highlights and shadows. */
  pixelCount: number;
  /** Spread of the a/b channels; large spread = uneven color or skin bleeding in. */
  spread: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  /** % of lip pixels that are specular highlights (gloss). */
  shine: number;
  finish: Finish;
  /** Typical color of the darker and lighter parts of the lips (shading, metallic sheen, two-tone looks). */
  tones?: LipTones;
};

export type LipTones = { dark: string; light: string };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];

/**
 * Robust lip color:
 * 1. collect Lab values of masked pixels
 * 2. drop the darkest 15% (shadows, mouth corners) and brightest 15% (gloss highlights, teeth)
 * 3. take the per-channel median of the rest
 */
export function measureLipColor(px: Pixels, mask: Uint8Array): LipMeasurement {
  const labs: Lab[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const o = i * 4;
    if (px.data[o + 3] < 128) continue; // transparent
    labs.push(rgbToLab(px.data[o], px.data[o + 1], px.data[o + 2]));
  }
  const reasons: string[] = [];
  if (labs.length < 50) {
    return { hex: "#000000", lab: { L: 0, a: 0, b: 0 }, pixelCount: labs.length, spread: 0, confidence: "low", reasons: ["lips not found or too small"], shine: 0, finish: "matte" };
  }

  // Shine is measured on all lip pixels, before highlights are trimmed away for the color.
  const shine = measureShine(labs);
  const tones = measureTones(labs);

  labs.sort((x, y) => x.L - y.L);
  const trimmed = labs.slice(Math.floor(labs.length * 0.15), Math.ceil(labs.length * 0.85));
  const lab = { L: median(trimmed.map((p) => p.L)), a: median(trimmed.map((p) => p.a)), b: median(trimmed.map((p) => p.b)) };

  const as = trimmed.map((p) => p.a).sort((x, y) => x - y);
  const bs = trimmed.map((p) => p.b).sort((x, y) => x - y);
  const spread = Math.hypot(quantile(as, 0.75) - quantile(as, 0.25), quantile(bs, 0.75) - quantile(bs, 0.25));

  if (trimmed.length < 400) reasons.push("lips are small in the photo; use a closer shot");
  if (spread > 12) reasons.push("lip color is uneven (lighting, gloss, or blending)");
  if (lab.L < 20) reasons.push("photo is very dark");
  const confidence = reasons.length === 0 ? "high" : reasons.length === 1 ? "medium" : "low";

  return { hex: labToHex(lab), lab, pixelCount: trimmed.length, spread: Math.round(spread * 10) / 10, confidence, reasons, shine, finish: finishFromShine(shine), tones };
}

/**
 * Darker and lighter parts of the lips: medians of the 10-40% and 60-90% lightness bands,
 * leaving out whitish specular highlights (those count as shine, not color).
 */
export function measureTones(labs: Lab[]): LipTones {
  const Ls = labs.map((p) => p.L).sort((x, y) => x - y);
  const Cs = labs.map((p) => Math.hypot(p.a, p.b)).sort((x, y) => x - y);
  const medL = Ls[Ls.length >> 1], medC = Cs[Cs.length >> 1];
  const colored = labs.filter((p) => !(p.L > medL + 18 && Math.hypot(p.a, p.b) < medC * 0.85)).sort((x, y) => x.L - y.L);
  const band = (from: number, to: number) => {
    const xs = colored.slice(Math.floor(colored.length * from), Math.ceil(colored.length * to));
    return labToHex({ L: median(xs.map((p) => p.L)), a: median(xs.map((p) => p.a)), b: median(xs.map((p) => p.b)) });
  };
  return { dark: band(0.1, 0.4), light: band(0.6, 0.9) };
}

export type MatchVerdict = "looks the same" | "very close" | "close" | "noticeably different" | "different";

/** Plain-language verdict for a CIEDE2000 difference between two measured lip colors. */
export function matchVerdict(deltaE: number): MatchVerdict {
  if (deltaE < 2) return "looks the same";
  if (deltaE < 4) return "very close";
  if (deltaE < 7) return "close";
  if (deltaE < 12) return "noticeably different";
  return "different";
}

/** 0-100 "match score" for the UI: 100 at deltaE 0, 0 at deltaE >= 20. */
export function matchScore(deltaE: number): number {
  return Math.max(0, Math.round(100 - deltaE * 5));
}

export function compareMeasurements(a: LipMeasurement, b: LipMeasurement) {
  const dE = deltaE2000(a.hex, b.hex);
  return { deltaE: Math.round(dE * 10) / 10, verdict: matchVerdict(dE), score: matchScore(dE) };
}

/**
 * Robust typical color of a masked region: median Lab after dropping the
 * darkest and brightest 15% (shadows, shine). Returns null if too few pixels.
 */
export function regionLab(px: Pixels, mask: Uint8Array, minPixels = 100): { lab: Lab; pixelCount: number } | null {
  const labs: Lab[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const o = i * 4;
    if (px.data[o + 3] < 128) continue;
    labs.push(rgbToLab(px.data[o], px.data[o + 1], px.data[o + 2]));
  }
  if (labs.length < minPixels) return null;
  labs.sort((x, y) => x.L - y.L);
  const t = labs.slice(Math.floor(labs.length * 0.15), Math.ceil(labs.length * 0.85));
  return { lab: { L: median(t.map((p) => p.L)), a: median(t.map((p) => p.a)), b: median(t.map((p) => p.b)) }, pixelCount: t.length };
}

/** Blush tint: how the cheeks differ from reference skin (forehead) in the same photo. */
export type BlushTint = { dL: number; da: number; db: number };

export function blushTint(cheek: Lab, reference: Lab): BlushTint {
  const r = (x: number) => Math.round(x * 10) / 10;
  return { dL: r(cheek.L - reference.L), da: r(cheek.a - reference.a), db: r(cheek.b - reference.b) };
}

/**
 * Cheek-vs-forehead lightness mostly reflects lighting (overhead light darkens
 * cheeks), not blush, so it counts for little. Calibrated 2026-10-20: bare
 * selfies ranged lightness +1.5 to -25.5 with redness only +1.8 to +3.7.
 */
export const TINT_LIGHTNESS_WEIGHT = 0.25;

/**
 * Weight for lightness when both tints come from the same base photo (look on you vs a
 * try-on on the same selfie): the lighting is identical, so lightness differences are real.
 */
export const SAME_PHOTO_LIGHTNESS_WEIGHT = 0.6;

/** Difference between two blush tints: mostly color (redness, yellowness), lightness down-weighted. */
export function tintDifference(a: BlushTint, b: BlushTint, lightnessWeight = TINT_LIGHTNESS_WEIGHT): number {
  return Math.round(Math.hypot(lightnessWeight * (a.dL - b.dL), a.da - b.da, a.db - b.db) * 10) / 10;
}
