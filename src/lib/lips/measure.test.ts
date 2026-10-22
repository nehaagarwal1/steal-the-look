import { describe, expect, it } from "vitest";
import { deltaE2000, hexToLab, hexToRgb, labToHex } from "@/lib/color";
import { compareMeasurements, matchVerdict, measureLipColor, type Pixels } from "./measure";
import { cheapestCloseMatches, rankLipsticks } from "./match";

/** Synthetic image: every pixel `base`, except a fraction replaced by highlight/shadow outliers. */
function fakeLips(base: string, n = 2000, outliers = 0.2): { px: Pixels; mask: Uint8Array } {
  const [r, g, b] = hexToRgb(base);
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const roll = (i * 7919) % 100; // deterministic pseudo-random
    if (roll < (outliers * 100) / 2) data.set([255, 255, 255, 255], o); // gloss highlight
    else if (roll < outliers * 100) data.set([10, 5, 5, 255], o); // shadow
    else data.set([r, g, b, 255], o);
  }
  return { px: { data, width: n, height: 1 }, mask: new Uint8Array(n).fill(1) };
}

describe("labToHex", () => {
  it("round-trips hex -> Lab -> hex", () => {
    for (const hex of ["#E8735A", "#7B2D4F", "#C1121F", "#FFFFFF", "#000000", "#1F2A44"]) {
      expect(deltaE2000(labToHex(hexToLab(hex)), hex)).toBeLessThan(0.5);
    }
  });
});

describe("measureLipColor", () => {
  it("ignores gloss highlights and shadows", () => {
    const { px, mask } = fakeLips("#B5655B", 2000, 0.2);
    const m = measureLipColor(px, mask);
    expect(deltaE2000(m.hex, "#B5655B")).toBeLessThan(1);
    expect(m.confidence).toBe("high");
  });

  it("only uses masked pixels", () => {
    const { px } = fakeLips("#B5655B", 1000, 0);
    const mask = new Uint8Array(1000); // nothing masked
    expect(measureLipColor(px, mask).confidence).toBe("low");
  });

  it("flags small lip areas", () => {
    const { px, mask } = fakeLips("#B5655B", 300, 0);
    const m = measureLipColor(px, mask);
    expect(m.reasons.join(" ")).toMatch(/small/);
  });
});

describe("matching", () => {
  it("verdicts scale with difference", () => {
    expect(matchVerdict(1)).toBe("looks the same");
    expect(matchVerdict(15)).toBe("different");
  });

  it("ranks the exact catalog shade first", () => {
    expect(rankLipsticks("#E06A55")[0].product.shade).toBe("Coral Crush");
    expect(rankLipsticks("#7B2D4F")[0].product.shade).toBe("Wild Berry");
  });

  it("puts the cheapest close match first", () => {
    const ranked = rankLipsticks("#E8735A");
    const cheap = cheapestCloseMatches(ranked, 100); // everything counts as "close"
    expect(cheap[0].product.price).toBe(Math.min(...ranked.map((c) => c.product.price)));
  });

  it("compares two measurements", () => {
    const a = measureLipColor(fakeLips("#E8735A").px, fakeLips("#E8735A").mask);
    const b = measureLipColor(fakeLips("#E4708F").px, fakeLips("#E4708F").mask);
    expect(compareMeasurements(a, a).verdict).toBe("looks the same");
    expect(compareMeasurements(a, b).deltaE).toBeGreaterThan(5);
  });
});

describe("blush tint", () => {
  it("measures how cheeks differ from reference skin, ignoring a shared shift", async () => {
    const { regionLab, blushTint, tintDifference } = await import("./measure");
    const skin = fakeLips("#C9A08A", 2000, 0); // forehead
    const cheek = fakeLips("#D49488", 2000, 0); // pinker cheek
    const t1 = blushTint(regionLab(cheek.px, cheek.mask)!.lab, regionLab(skin.px, skin.mask)!.lab);
    expect(t1.da).toBeGreaterThan(3);
    // Foundation that shifts both regions alike shouldn't change the tint much.
    const skin2 = fakeLips("#C4A08E", 2000, 0), cheek2 = fakeLips("#CF9489", 2000, 0);
    const t2 = blushTint(regionLab(cheek2.px, cheek2.mask)!.lab, regionLab(skin2.px, skin2.mask)!.lab);
    expect(tintDifference(t1, t2)).toBeLessThan(2.5);
  });

  it("treats lighting-driven lightness changes as minor (real bare selfies, 2026-10-20)", async () => {
    const { tintDifference } = await import("./measure");
    // selfie1 vs selfie3: both bare; the big lightness gap was lighting.
    expect(tintDifference({ dL: 1.5, da: 1.8, db: -1.6 }, { dL: -25.5, da: 3.7, db: -8.3 })).toBeLessThan(10);
    // A clear redness change still registers.
    expect(tintDifference({ dL: 0, da: 2, db: 0 }, { dL: 0, da: 9, db: 0 })).toBeGreaterThan(6);
  });

  it("returns null for too few pixels", async () => {
    const { regionLab } = await import("./measure");
    const tiny = fakeLips("#C9A08A", 20, 0);
    expect(regionLab(tiny.px, tiny.mask)).toBeNull();
  });
});

describe("measureTones", () => {
  it("separates a two-tone lip into dark and light parts, ignoring whitish highlights", async () => {
    const { measureTones } = await import("./measure");
    const { deltaE2000 } = await import("@/lib/color");
    const labs = [
      ...Array.from({ length: 50 }, () => ({ L: 20, a: 30, b: 18 })), // dark upper lip
      ...Array.from({ length: 50 }, () => ({ L: 45, a: 50, b: 35 })), // bright lower lip
      ...Array.from({ length: 5 }, () => ({ L: 90, a: 2, b: 2 })),    // specular glints
    ];
    const t = measureTones(labs);
    expect(deltaE2000(t.dark, t.light)).toBeGreaterThan(15);
    expect(deltaE2000(t.light, "#FFFFFF")).toBeGreaterThan(40); // glints didn't count as color
  });
});
