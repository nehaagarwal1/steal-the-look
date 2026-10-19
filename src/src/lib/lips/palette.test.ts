import { describe, expect, it } from "vitest";
import { catalog, type LipProduct } from "@/data/catalog";
import { lipPalette } from "./palette";

const needs: Record<LipProduct["texture"], (keyof ReturnType<typeof lipPalette>)[]> = {
  matte: [],
  satin: [],
  gloss: ["gloss", "transparencyIntensity"],
  sheer: ["transparencyIntensity"],
  shimmer: ["gloss", "transparencyIntensity", "shimmerColor", "shimmerIntensity", "shimmerDensity", "shimmerSize"],
  metallic: ["gloss", "shimmerColor", "shimmerIntensity", "shimmerDensity", "shimmerSize"],
  holographic: ["gloss", "shimmerColor", "shimmerIntensity", "shimmerDensity", "shimmerSize"],
};

describe("lipPalette", () => {
  it("includes the fields each finish requires", () => {
    for (const [texture, fields] of Object.entries(needs)) {
      const p = lipPalette({ hex: "#87404B", texture: texture as LipProduct["texture"] });
      for (const f of ["color", "texture", "colorIntensity", ...fields]) expect(p, `${texture}.${f}`).toHaveProperty(f);
    }
  });

  it("produces valid values for every catalog lipstick", () => {
    for (const prod of catalog.filter((x): x is LipProduct => x.kind === "lipstick")) {
      const p = lipPalette(prod);
      expect(p.color).toMatch(/^#[0-9A-F]{6}$/i);
      for (const k of ["colorIntensity", "gloss", "transparencyIntensity", "shimmerIntensity", "shimmerDensity", "shimmerSize"] as const) {
        if (p[k] !== undefined) expect(p[k]).toBeGreaterThanOrEqual(0), expect(p[k]).toBeLessThanOrEqual(100);
      }
      for (const f of needs[prod.texture]) expect(p).toHaveProperty(f);
    }
  });
});
