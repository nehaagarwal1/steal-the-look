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
