// Lip finish (glossy / satin / matte): from photos via highlight measurement,
// and from catalog products via their texture.

import type { LipProduct } from "@/data/catalog";
import type { Lab } from "@/lib/color";

export type Finish = "glossy" | "satin" | "matte";

/** Finish rank on a scale, so "satin vs glossy" counts as closer than "matte vs glossy". */
const RANK: Record<Finish, number> = { matte: 0, satin: 1, glossy: 2 };

export function productFinish(texture: LipProduct["texture"]): Finish {
  if (texture === "matte") return "matte";
  if (texture === "satin") return "satin";
  return "glossy"; // gloss, sheer, shimmer, metallic, holographic all show highlights
}

/** 0 = same finish, 1 = one step off (e.g. satin vs glossy), 2 = opposite (matte vs glossy). */
export function finishDistance(a: Finish, b: Finish): number {
  return Math.abs(RANK[a] - RANK[b]);
}

/**
 * Highlight thresholds (% of lip pixels that are specular highlights).
 * Calibrated 2026-10-15 in the lip lab: matte try-ons measured 0%, a YouCam
 * gloss try-on 1.5%, real glossy photos 4.9-7.2%. Satin is the narrow band
 * between; recheck it once satin examples have been measured.
 */
export const SHINE_GLOSSY = 1;
export const SHINE_SATIN = 0.3;

export function finishFromShine(shine: number): Finish {
  if (shine >= SHINE_GLOSSY) return "glossy";
  if (shine >= SHINE_SATIN) return "satin";
  return "matte";
}

/**
 * Shine = % of lip pixels that look like specular highlights: much lighter
 * than the typical lip pixel and less saturated (light reflecting off a glossy
 * surface is whitish). Matte lips have shading but few such pixels.
 */
export function measureShine(labs: Lab[]): number {
  if (labs.length === 0) return 0;
  const Ls = labs.map((p) => p.L).sort((a, b) => a - b);
  const Cs = labs.map((p) => Math.hypot(p.a, p.b)).sort((a, b) => a - b);
  const medL = Ls[Ls.length >> 1], medC = Cs[Cs.length >> 1];
  let n = 0;
  for (const p of labs) if (p.L > medL + 18 && Math.hypot(p.a, p.b) < medC * 0.85) n++;
  return Math.round((n / labs.length) * 1000) / 10;
}

export function describeFinishMismatch(shade: Finish, look: Finish): string | null {
  if (shade === look) return null;
  return `${shade[0].toUpperCase()}${shade.slice(1)} instead of ${look}.`;
}
