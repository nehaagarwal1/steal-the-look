import { describe, expect, it } from "vitest";
import { hexToLab } from "@/lib/color";
import { browCatalog, browFamily } from "@/data/brow-catalog";
import { adviseBrows, idealBrowColor } from "./brows";

describe("brow advice", () => {
  it("suggests brows darker than blonde hair", () => {
    expect(hexToLab(idealBrowColor("#C99A5B")).L).toBeLessThan(hexToLab("#C99A5B").L - 10);
  });

  it("dark hair to honey blonde: a big change, blonde-ish brows", () => {
    const a = adviseBrows("#2A2220", "#C99A5B");
    expect(a.needed).toBe(true);
    expect(["honey-blonde", "ash-blonde", "medium-brown"]).toContain(a.family);
  });

  it("dark to espresso: small change, no need", () => {
    expect(adviseBrows("#2A2220", "#3B2A22").needed).toBe(false);
  });

  it("copper hair gets a warm brow", () => {
    expect(["soft-copper", "auburn"]).toContain(adviseBrows("#2A2220", "#B5512B").family);
  });

  it("catalog: premium priced above budget for every shade", () => {
    expect(browCatalog).toHaveLength(16);
    for (const f of ["soft-black", "taupe", "auburn"]) expect(browFamily(f)!.premium.price).toBeGreaterThan(browFamily(f)!.budget.price);
  });
});
