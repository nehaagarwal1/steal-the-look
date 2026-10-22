import { describe, expect, it } from "vitest";
import { blushCatalog } from "@/data/blush-catalog";
import { hexToLab } from "@/lib/color";
import { tintDifference, type BlushTint } from "@/lib/lips/measure";
import {
  bestBlush, blushVerdict, buildBlushProof, DEFAULT_STRENGTH, fitStrength, hasBlush, predictTint, rankBlushFamilies,
} from "./plan";

// A simulated face: bare cheeks and the "true" strength blush shows with.
const bareCheek = hexToLab("#B07A66");
const base: BlushTint = { dL: 3.7, da: 1.5, db: -2.4 }; // real bare selfie reading, 2026-10-20
const trueStrength = { L: 0.12, a: 0.28, b: 0.24 };
const onFace = (hex: string) => predictTint(hex, base, bareCheek, trueStrength);

describe("blush catalog", () => {
  it("has three price tiers per family with fake dupes", () => {
    expect(blushCatalog.length).toBe(42);
    const fam = (k: string) => blushCatalog.filter((b) => b.family === k);
    for (const k of ["ballet-pink", "candy", "bronze-sun"]) {
      const [p, m, c] = fam(k).sort((a, b) => b.price - a.price);
      expect(p.price).toBeGreaterThan(m.price);
      expect(m.price).toBeGreaterThan(c.price);
    }
  });
});

describe("blush model", () => {
  it("learns the strength from a couple of try-ons", () => {
    const tried = blushCatalog.filter((b) => ["aurb-candy", "aurb-tangerine", "aurb-plum-dusk"].includes(b.id));
    const s = fitStrength(tried.map((p) => ({ product: p, tint: onFace(p.hex) })), base, bareCheek);
    expect(s.a).toBeCloseTo(trueStrength.a, 2);
    expect(s.b).toBeCloseTo(trueStrength.b, 2);
  });

  it("finds the right family once calibrated, even if the default guess was off", () => {
    const targetProduct = blushCatalog.find((b) => b.id === "aurb-peach-glow")!;
    const target = onFace(targetProduct.hex);
    const ranked = rankBlushFamilies(target, base, bareCheek, trueStrength);
    expect(ranked[0].premium.family).toBe("peach-glow");
    expect(rankBlushFamilies(target, base, bareCheek, DEFAULT_STRENGTH).slice(0, 4).map((f) => f.premium.family)).toContain("peach-glow");
  });

  it("detects looks with no blush", () => {
    expect(hasBlush(base, base)).toBe(false);
    expect(hasBlush(onFace("#E86A8A"), base)).toBe(true);
  });
});

describe("blush proof", () => {
  it("ranks by tint match and flags true vs fake dupes", () => {
    const pick = (id: string) => blushCatalog.find((b) => b.id === id)!;
    const target = onFace(pick("aurb-rose-petal").hex);
    const measured = ["aurb-rose-petal", "dbb-rose-petal", "aurb-candy", "dbb-candy"].map((id) => ({ product: pick(id), tint: onFace(pick(id).hex) }));
    const cards = buildBlushProof(target, measured);
    expect(cards[0].product.family).toBe("rose-petal");
    expect(cards.find((c) => c.product.id === "dbb-rose-petal")!.dupe!.isTrueDupe).toBe(true);
    expect(cards.find((c) => c.product.id === "dbb-candy")!.dupe!.isTrueDupe).toBe(false);
    expect(bestBlush(cards)!.product.id).toBe("dbb-rose-petal");
  });

  it("uses a gentler scale than lipstick", () => {
    expect(blushVerdict(2)).toBe("very close");
    expect(blushVerdict(9)).toBe("different");
    // pink vs peach on the real face (≈ 8.6) reads as clearly different
    expect(blushVerdict(tintDifference({ dL: 1, da: 8.3, db: -8 }, { dL: 3.1, da: 3.8, db: -0.7 }))).toBe("different");
  });
});
