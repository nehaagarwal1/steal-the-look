// Plain-language "why this shade" explanations, computed from how a shade on the
// shopper's lips differs from the look on their lips. Pure: no browser APIs.

import { deltaE2000, hexToLab } from "@/lib/color";

type Size = "barely" | "slightly" | "noticeably" | "much";

/** Size words for one color dimension (Lab units). Below the first step it isn't mentioned. */
function size(d: number): Size | null {
  const a = Math.abs(d);
  if (a < 2) return null;
  if (a < 4) return "slightly";
  if (a < 8) return "noticeably";
  return "much";
}

const SIZE_RANK: Record<Size, number> = { barely: 0, slightly: 1, noticeably: 2, much: 3 };

/** Bigger size word first; equal sizes keep a fixed order (lightness, hue, vividness) so similar shades read the same. */
const MOST_IMPORTANT_FIRST = (a: { mag: number; order: number }, b: { mag: number; order: number }) =>
  SIZE_RANK[size(b.mag)!] - SIZE_RANK[size(a.mag)!] || a.order - b.order;

export type Explanation = {
  /** e.g. "Slightly deeper and cooler than the look." */
  difference: string;
  /** e.g. "Most people won't notice the difference." */
  takeaway: string;
  /** Both together, for screen readers and captions. */
  sentence: string;
};

/**
 * Describes `shadeHex` (measured on the lips) relative to `targetHex` (the look on the lips).
 * Lightness: deeper / lighter. Hue: warmer (toward orange) / cooler (toward pink-blue).
 * Chroma: more / less vivid. Only differences big enough to matter are mentioned.
 */
export function explainShade(targetHex: string, shadeHex: string): Explanation {
  const t = hexToLab(targetHex), s = hexToLab(shadeHex);
  const tC = Math.hypot(t.a, t.b), sC = Math.hypot(s.a, s.b);
  const tH = (Math.atan2(t.b, t.a) * 180) / Math.PI, sH = (Math.atan2(s.b, s.a) * 180) / Math.PI;
  let dHue = sH - tH;
  if (dHue > 180) dHue -= 360;
  if (dHue < -180) dHue += 360;
  // Hue difference expressed in the same units as lightness and chroma (arc length on the color wheel).
  const hueMag = 2 * Math.sqrt(tC * sC) * Math.sin((Math.abs(dHue) * Math.PI) / 360);

  const parts = [
    { order: 0, mag: Math.abs(s.L - t.L), word: s.L < t.L ? "deeper" : "lighter" },
    { order: 1, mag: hueMag, word: dHue > 0 ? "warmer" : "cooler" },
    { order: 2, mag: Math.abs(sC - tC), word: sC > tC ? "more vivid" : "softer" },
  ]
    .filter((p) => size(p.mag))
    .sort(MOST_IMPORTANT_FIRST)
    .slice(0, 2);

  let difference: string;
  if (parts.length === 0) {
    difference = "Practically the same color as the look.";
  } else {
    const lead = size(parts[0].mag)!;
    const words = parts.map((p, i) => (i === 0 ? p.word : (size(p.mag) === lead ? p.word : `${size(p.mag)} ${p.word}`)));
    difference = `${lead[0].toUpperCase()}${lead.slice(1)} ${words.join(" and ")} than the look.`;
  }

  const dE = deltaE2000(targetHex, shadeHex);
  const takeaway =
    dE < 2 ? "Looks the same on you."
    : dE < 4 ? "Most people won't notice the difference."
    : dE < 7 ? "Close, but you may see it side by side."
    : "A clearly different color on you.";

  return { difference, takeaway, sentence: `${difference} ${takeaway}` };
}
