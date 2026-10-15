import { describe, expect, it } from "vitest";
import { catalog, getProduct, type LipProduct } from "@/data/catalog";
import { deltaE2000, hexToLab } from "@/lib/color";
import { describeFinishMismatch, finishDistance, finishFromShine, measureShine, productFinish } from "./finish";
import { bestBuy, buildProof, pickCandidates } from "./plan";

const lipLab = hexToLab("#87404B");
const highlight = { L: lipLab.L + 35, a: lipLab.a * 0.4, b: lipLab.b * 0.4 }; // whitish reflection
const shadow = { L: lipLab.L - 15, a: lipLab.a, b: lipLab.b };

function lips(highlightShare: number, shadowShare = 0.15, n = 2000) {
  return Array.from({ length: n }, (_, i) => {
    const r = ((i * 7919) % 1000) / 1000; // deterministic spread
    return r < highlightShare ? highlight : r < highlightShare + shadowShare ? shadow : lipLab;
  });
}

describe("measureShine", () => {
  it("is near zero for matte lips, even with shading", () => {
    expect(measureShine(lips(0))).toBeLessThan(1);
    expect(finishFromShine(measureShine(lips(0)))).toBe("matte");
  });

  it("detects glossy highlights", () => {
    const shine = measureShine(lips(0.08));
    expect(shine).toBeGreaterThan(6);
    expect(finishFromShine(shine)).toBe("glossy");
  });

  it("puts light sheen in between", () => {
    expect(finishFromShine(measureShine(lips(0.006)))).toBe("satin");
  });

  it("matches the lip-lab calibration (matte 0%, YouCam gloss try-on 1.5%, real gloss 4.9-7.2%)", () => {
    expect(finishFromShine(0)).toBe("matte");
    expect(finishFromShine(1.5)).toBe("glossy");
    expect(finishFromShine(4.9)).toBe("glossy");
    expect(finishFromShine(7.2)).toBe("glossy");
  });
});

describe("finish helpers", () => {
  it("maps textures to finishes", () => {
    expect(productFinish("matte")).toBe("matte");
    expect(productFinish("satin")).toBe("satin");
    expect(productFinish("gloss")).toBe("glossy");
    expect(productFinish("sheer")).toBe("glossy");
  });

  it("measures finish distance", () => {
    expect(finishDistance("matte", "glossy")).toBe(2);
    expect(finishDistance("satin", "glossy")).toBe(1);
    expect(describeFinishMismatch("matte", "glossy")).toBe("Matte instead of glossy.");
    expect(describeFinishMismatch("glossy", "glossy")).toBeNull();
  });
});

describe("finish-aware matching", () => {
  it("prefers shades with the look's finish when colors are similar", () => {
    const hex = "#87404B";
    const glossyPicks = pickCandidates(hex, { families: 2, finish: "glossy" });
    const mattePicks = pickCandidates(hex, { families: 2, finish: "matte" });
    expect(glossyPicks.every((p) => productFinish(p.texture) !== "matte")).toBe(true);
    expect(mattePicks.every((p) => productFinish(p.texture) !== "glossy")).toBe(true);
  });

  it("still picks close colors (finish never wins over a much better color)", () => {
    const lips = catalog.filter((p): p is LipProduct => p.kind === "lipstick");
    const nearest = Math.min(...lips.map((p) => deltaE2000("#87404B", p.hex)));
    const picks = pickCandidates("#87404B", { families: 2, finish: "glossy" });
    for (const p of picks) expect(deltaE2000("#87404B", p.hex)).toBeLessThan(nearest + 6);
  });

  it("best buy prefers the matching finish among near-ties", () => {
    const gloss = getProduct("aur-g12-38-40") as LipProduct; // gloss
    const matte = getProduct("db-g12-46-40") as LipProduct; // matte, cheaper
    const cards = buildProof("#87404B", [
      { product: gloss, hex: "#8A424D" },
      { product: matte, hex: "#88414C" },
    ], "glossy");
    expect(cards.find((c) => c.product.id === matte.id)?.finishMatch).toBe(false);
    expect(bestBuy(cards)?.product.id).toBe(gloss.id);
  });
});
