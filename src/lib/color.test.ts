import { describe, expect, it } from "vitest";
import { colorName, skinDepthName, contrastLevel, deltaE2000, harmony, hexToLab, lightnessContrast, productTemperature } from "./color";

describe("color engine", () => {
  it("converts white and black to Lab", () => {
    expect(hexToLab("#FFFFFF").L).toBeCloseTo(100, 0);
    expect(hexToLab("#000000").L).toBeCloseTo(0, 0);
  });

  it("gives sensible CIEDE2000 distances", () => {
    expect(deltaE2000("#E8735A", "#E8735A")).toBeCloseTo(0, 5);
    expect(deltaE2000("#000000", "#FFFFFF")).toBeGreaterThan(90);
  });

  it("classifies contrast and depth", () => {
    expect(contrastLevel(5)).toBe("subtle");
    expect(contrastLevel(30)).toBe("bold");
    expect(lightnessContrast("#7B2D4F", "#B5655B")).toMatch(/deeper/);
  });

  it("names colors in speakable terms", () => {
    expect(colorName("#C1121F")).toMatch(/red/);
    expect(colorName("#1F2A44")).toBe("deep blue");
    expect(colorName("#7B2D4F")).toBe("berry");
    expect(colorName("#E8735A")).toMatch(/coral/);
    expect(colorName("#000000")).toBe("black");
    expect(skinDepthName("#C99A7E")).toBe("medium");
  });

  it("knows warm vs cool products", () => {
    expect(productTemperature("#E8735A")).toBe("warm");
    expect(harmony("#E8735A", "#1F2A44")).not.toBe("matching");
  });
});
