import { describe, expect, it } from "vitest";
import { hexToRgb, deltaE2000 } from "@/lib/color";
import { hairCatalog, hairFamily } from "@/data/hair-catalog";
import { hairDupe, measureDyedHair } from "./compare";

// 20x20 photo: top half "hair", bottom half "face". Dyeing changes only the top half.
function photo(hairHex: string, faceHex = "#C08A6A") {
  const w = 20, h = 20, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b] = hexToRgb(i < (w * h) / 2 ? hairHex : faceHex);
    data.set([r, g, b, 255], i * 4);
  }
  return { data, width: w, height: h };
}

describe("measureDyedHair", () => {
  it("finds the recolored hair and reads each dye's color there", () => {
    const base = photo("#2A2220");
    const m = measureDyedHair(base, [photo("#B5512B"), photo("#B0532E")]);
    expect(m.coverage).toBe(0.5);
    expect(m.reliable).toBe(true);
    expect(deltaE2000(m.colors[0], "#B5512B")).toBeLessThan(1);
  });

  it("flags when almost nothing changed (dye too close to the hair color)", () => {
    const base = photo("#2A2220");
    expect(measureDyedHair(base, [photo("#2B2321")]).reliable).toBe(false);
  });
});

describe("hair dupes", () => {
  it("true dupe vs fake dupe", () => {
    expect(hairDupe("#B5512B", "#B4532C").isTrueDupe).toBe(true);
    expect(hairDupe("#7E2F22", "#9A4A2A").label).toBe("clearly different on me");
  });

  it("catalog: 12 shades x 3 prices, salon priced above budget, fake dupes differ in the box", () => {
    expect(hairCatalog).toHaveLength(36);
    const auburn = hairFamily("auburn")!, copper = hairFamily("copper")!;
    expect(auburn.premium.price).toBeGreaterThan(auburn.budget.price);
    expect(deltaE2000(auburn.premium.hex, auburn.budget.hex)).toBeGreaterThan(8);
    expect(deltaE2000(copper.premium.hex, copper.budget.hex)).toBeLessThan(4);
  });
});

describe("global brightening", () => {
  it("ignores YouCam's overall brightening when finding the recolored hair", () => {
    const base = photo("#2A2220", "#B07A5A");
    const dyed = photo("#B5512B", "#BC8666"); // face 12/255 brighter per channel, hair recolored
    const m = measureDyedHair(base, [dyed], { changed: 30 });
    expect(m.coverage).toBe(0.5);
  });
});
