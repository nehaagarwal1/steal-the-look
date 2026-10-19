import { describe, expect, it } from "vitest";
import { getProduct, type LipProduct } from "@/data/catalog";
import { bestBuy, buildProof, estimateShift, groupByFamily, mergeProfile, pickCalibrated, pickCandidates, refineCandidates } from "./plan";
import { deltaE2000, hexToLab, labToHex } from "@/lib/color";

const lip = (id: string) => getProduct(id) as LipProduct;

describe("pickCandidates", () => {
  it("returns premium + cheapest for the closest families", () => {
    const picks = pickCandidates("#7B2D4F", { families: 2 });
    expect(picks.length).toBe(4);
    expect(picks[0].price).toBeGreaterThan(picks[1].price); // premium first, then its cheap version
    expect(picks[0].family).toBe(picks[1].family);
  });

  it("respects an allow-list (demo mode)", () => {
    const allowed = new Set(["aur-berry", "db-berry", "lum-mauve"]);
    const picks = pickCandidates("#893F4A", { families: 2, allowed });
    expect(picks.every((p) => allowed.has(p.id))).toBe(true);
  });
});

describe("buildProof", () => {
  // Illustrative values shaped like the 2026-10-14 experiment (mauve closest; $42 and $6 berry near-identical).
  const target = "#8A4A5C";
  const measured = [
    { product: lip("aur-berry"), hex: "#5E2A44" },
    { product: lip("db-berry"), hex: "#5F2B45" },
    { product: lip("lum-mauve"), hex: "#7E4C5E" },
  ];

  it("ranks by on-face match and flags true dupes", () => {
    const cards = buildProof(target, measured);
    expect(cards[0].product.id).toBe("lum-mauve");
    const db = cards.find((c) => c.product.id === "db-berry")!;
    expect(db.savings).toBe(lip("aur-berry").price - lip("db-berry").price);
    expect(db.dupe?.isTrueDupe).toBe(true);
  });

  it("flags marketed dupes that differ on the face", () => {
    const cards = buildProof(target, [
      { product: lip("aur-berry"), hex: "#5E2A44" },
      { product: lip("db-berry"), hex: "#8A3050" }, // clearly different on-face
    ]);
    expect(cards.find((c) => c.product.id === "db-berry")!.dupe?.isTrueDupe).toBe(false);
  });

  it("recommends the cheapest near-best shade", () => {
    const cards = buildProof("#5E2A44", measured);
    expect(bestBuy(cards)?.product.id).toBe("db-berry");
  });
});

describe("refineCandidates", () => {
  // Simulated face: every shade renders darker and slightly cooler than its catalog color.
  const render = (hex: string) => { const c = hexToLab(hex); return labToHex({ L: c.L - 9, a: c.a - 3, b: c.b - 6 }); };

  it("finds a shade that lands closer to the target after one round", () => {
    const target = "#87404B";
    const round1 = pickCandidates(target, { families: 2 }).map((p) => ({ product: p, hex: render(p.hex) }));
    const best1 = Math.min(...round1.map((m) => deltaE2000(target, m.hex)));
    const { picks, shift } = refineCandidates(target, round1, { families: 1 });
    expect(shift.L).toBeLessThan(-5); // learned "renders darker"
    const best2 = Math.min(...picks.map((p) => deltaE2000(target, render(p.hex))));
    expect(best2).toBeLessThan(best1);
    expect(best2).toBeLessThan(4);
  });

  it("never re-tries a shade family", () => {
    const target = "#87404B";
    const round1 = pickCandidates(target, { families: 2 }).map((p) => ({ product: p, hex: render(p.hex) }));
    const tried = new Set(round1.map((m) => m.product.family));
    expect(refineCandidates(target, round1).picks.every((p) => !tried.has(p.family!))).toBe(true);
  });
});

describe("groupByFamily", () => {
  it("puts premium and dupe of a shade together, best family first, weak ones flagged", () => {
    const cards = buildProof("#87404B", [
      { product: lip("aur-berry"), hex: "#5E2A44" },
      { product: lip("db-berry"), hex: "#5F2B45" },
      { product: lip("aur-mauve"), hex: "#86414C" },
      { product: lip("db-mauve"), hex: "#8A4550" },
    ]);
    const groups = groupByFamily(cards);
    expect(groups.map((g) => g.family)).toEqual(["mauve", "berry"]);
    expect(groups[0].variants[0].product.price).toBeGreaterThan(groups[0].variants[1].product.price);
    expect(groups[0].weak).toBe(false);
    expect(groups[1].weak).toBe(true);
  });
});

describe("lip profile", () => {
  const render = (hex: string) => { const c = hexToLab(hex); return labToHex({ L: c.L - 9, a: c.a - 3, b: c.b - 6 }); };
  const target = "#87404B";

  it("estimates the shift a face applies to catalog colors", () => {
    const round1 = pickCandidates(target, { families: 2 }).map((p) => ({ product: p, hex: render(p.hex) }));
    const shift = estimateShift(target, round1)!;
    expect(shift.L).toBeCloseTo(-9, 0);
    expect(shift.b).toBeCloseTo(-6, 0);
  });

  it("with a saved shift, the first round already lands very close", () => {
    const calibrated = pickCalibrated(target, { L: -9, a: -3, b: -6 }, { families: 2 });
    const best = Math.min(...calibrated.map((p) => deltaE2000(target, render(p.hex))));
    const uncalibrated = Math.min(...pickCandidates(target, { families: 2 }).map((p) => deltaE2000(target, render(p.hex))));
    expect(best).toBeLessThan(4);
    expect(best).toBeLessThan(uncalibrated);
  });

  it("averages sessions into the profile", () => {
    const p1 = mergeProfile(null, { L: -10, a: -2, b: -6 });
    expect(p1.looks).toBe(1);
    const p2 = mergeProfile(p1, { L: -8, a: -4, b: -6 });
    expect(p2.looks).toBe(2);
    expect(p2.shift.L).toBeCloseTo(-9);
    expect(p2.shift.a).toBeCloseTo(-3);
  });
});
