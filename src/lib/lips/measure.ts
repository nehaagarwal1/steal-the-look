// Pure lip-color measurement: given pixels and a lip mask, return a robust color.
// No browser APIs here, so it is unit-tested in Node.

import { deltaE2000, labToHex, rgbToLab, type Lab } from "@/lib/color";

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
};

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
    return { hex: "#000000", lab: { L: 0, a: 0, b: 0 }, pixelCount: labs.length, spread: 0, confidence: "low", reasons: ["lips not found or too small"] };
  }

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

  return { hex: labToHex(lab), lab, pixelCount: trimmed.length, spread: Math.round(spread * 10) / 10, confidence, reasons };
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
