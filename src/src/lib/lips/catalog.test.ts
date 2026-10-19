import { describe, expect, it } from "vitest";
import { catalog, type LipProduct } from "@/data/catalog";
import { deltaE2000 } from "@/lib/color";

const lip = (id: string) => catalog.find((p): p is LipProduct => p.id === id)!;

describe("dupe catalog", () => {
  it("varies prices within each tier and keeps premium > mid > budget", () => {
    const luxe = catalog.filter((p): p is LipProduct => p.id.startsWith("aur-"));
    const prices = (prefix: string) => new Set(catalog.filter((p) => p.id.startsWith(prefix)).map((p) => p.price));
    expect(prices("aur-").size).toBeGreaterThan(3);
    expect(prices("lum-").size).toBeGreaterThan(3);
    expect(prices("db-").size).toBeGreaterThan(3);
    for (const l of luxe) {
      expect(l.price).toBeGreaterThanOrEqual(34);
      expect(lip(`db-${l.family}`).price).toBeLessThanOrEqual(12);
    }
  });

  it("covers typical lip colors densely (nearest shade within ~5)", () => {
    const luxe = catalog.filter((p): p is LipProduct => p.id.startsWith("aur-"));
    for (const hex of ["#893F4A", "#C25E63", "#9C3B2E", "#E39A7D", "#6B353A"]) {
      expect(Math.min(...luxe.map((p) => deltaE2000(hex, p.hex)))).toBeLessThan(5);
    }
  });

  it("has three price tiers for every shade family", () => {
    const luxe = catalog.filter((p) => p.id.startsWith("aur-"));
    expect(luxe.length).toBeGreaterThan(200); // 12 named shades + evenly spaced grid
    expect(luxe.some((p) => p.id === "aur-berry")).toBe(true);
    for (const l of luxe) {
      const key = l.id.slice(4);
      expect(lip(`lum-${key}`).price).toBeLessThan(l.price);
      expect(lip(`db-${key}`).price).toBeLessThan(lip(`lum-${key}`).price);
    }
  });

  it("includes true dupes and honest non-dupes", () => {
    expect(deltaE2000(lip("aur-berry").hex, lip("db-berry").hex)).toBeLessThan(2); // true dupe
    for (const key of ["mauve", "coral", "blue-red"]) {
      expect(deltaE2000(lip(`aur-${key}`).hex, lip(`db-${key}`).hex)).toBeGreaterThan(6); // marketed dupe, measurably different
    }
  });
});
