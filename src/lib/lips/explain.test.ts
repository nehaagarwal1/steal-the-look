import { describe, expect, it } from "vitest";
import { hexToLab, labToHex } from "@/lib/color";
import { explainShade } from "./explain";

const target = "#87404B";
const shifted = (dL: number, da: number, db: number) => {
  const c = hexToLab(target);
  return labToHex({ L: c.L + dL, a: c.a + da, b: c.b + db });
};

describe("explainShade", () => {
  it("says when it's the same color", () => {
    const e = explainShade(target, target);
    expect(e.difference).toBe("Practically the same color as the look.");
    expect(e.takeaway).toBe("Looks the same on me.");
  });

  it("describes a deeper shade", () => {
    expect(explainShade(target, shifted(-10, 0, 0)).difference).toMatch(/^Much deeper/);
  });

  it("describes a lighter shade", () => {
    expect(explainShade(target, shifted(5, 0, 0)).difference).toMatch(/^Noticeably lighter/);
  });

  it("describes warmer (toward orange) and cooler (toward pink/blue)", () => {
    expect(explainShade(target, shifted(0, 0, 8)).difference).toMatch(/warmer/);
    expect(explainShade(target, shifted(0, 0, -8)).difference).toMatch(/cooler/);
  });

  it("mentions at most two differences, biggest first", () => {
    const e = explainShade(target, shifted(-12, 0, -5));
    expect(e.difference.split(" and ").length).toBeLessThanOrEqual(2);
    expect(e.difference).toMatch(/^Much deeper/);
  });

  it("uses the same word order for differences of the same size", () => {
    expect(explainShade(target, shifted(-3, 0, 3)).difference).toBe(explainShade(target, shifted(-3.4, 0, 2.6)).difference);
  });

  it("never mentions hex codes or numbers", () => {
    expect(explainShade(target, shifted(-6, 3, -4)).sentence).not.toMatch(/#|\d/);
  });

  it("matches the takeaway to the size of the difference", () => {
    expect(explainShade(target, shifted(-3, 0, 0)).takeaway).toBe("Most people won't notice the difference.");
    expect(explainShade(target, shifted(-15, 0, 0)).takeaway).toBe("A clearly different color on me.");
  });
});
