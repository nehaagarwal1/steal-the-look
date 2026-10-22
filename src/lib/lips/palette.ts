// Builds the YouCam makeup-vto lip palette for a product, including the extra
// fields each finish requires (per the AI Makeup Virtual Try-On spec):
//   gloss               -> gloss + transparencyIntensity
//   sheer               -> transparencyIntensity (+ gloss)
//   shimmer             -> shimmer fields + gloss + transparencyIntensity
//   metallic/holographic-> shimmer fields + gloss
//   matte/satin         -> nothing extra

import type { LipProduct } from "@/data/catalog";
import { hexToLab, labToHex } from "@/lib/color";

export type LipPalette = {
  color: string;
  texture: LipProduct["texture"];
  colorIntensity: number;
  gloss?: number;
  transparencyIntensity?: number;
  shimmerColor?: string;
  shimmerIntensity?: number;
  shimmerDensity?: number;
  shimmerSize?: number;
};

export function lipPalette(product: Pick<LipProduct, "hex" | "texture">): LipPalette {
  const p: LipPalette = { color: product.hex, texture: product.texture, colorIntensity: 80 };
  const t = product.texture;
  if (t === "gloss") Object.assign(p, { gloss: 60, transparencyIntensity: 20 });
  if (t === "sheer") Object.assign(p, { gloss: 40, transparencyIntensity: 50, colorIntensity: 60 });
  if (t === "shimmer" || t === "metallic" || t === "holographic") {
    const { L, a, b } = hexToLab(product.hex);
    Object.assign(p, {
      gloss: 50,
      shimmerColor: labToHex({ L: Math.min(95, L + 30), a: a * 0.4, b: b * 0.4 }), // lighter, softer sparkle
      shimmerIntensity: 50,
      shimmerDensity: 50,
      shimmerSize: 30,
    });
    if (t === "shimmer") p.transparencyIntensity = 20;
  }
  return p;
}

// --- Blush ----------------------------------------------------------------------

export type BlushTexture = "matte" | "satin" | "shimmer";

/** YouCam blush palette with the fields each finish requires (satin/shimmer need glowStrength; shimmer needs shimmer fields). */
export function blushPalette(hex: string, texture: BlushTexture = "matte", colorIntensity = 60) {
  const p: Record<string, string | number> = { color: hex, texture, colorIntensity };
  if (texture === "satin" || texture === "shimmer") p.glowStrength = 40;
  if (texture === "shimmer") Object.assign(p, { shimmerColor: "#FFF4E6", shimmerDensity: 40 });
  return p;
}
