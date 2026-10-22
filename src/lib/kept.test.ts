import { describe, expect, it } from "vitest";
import { getProduct } from "@/data/catalog";
import { hairFamily } from "@/data/hair-catalog";
import { browFamily } from "@/data/brow-catalog";
import { keptOn, keptTotal, splurgePrice } from "./kept";

describe("I keep $X", () => {
  it("is the difference to the splurge version of the same shade", () => {
    const cheap = getProduct("db-berry")!, splurge = getProduct("aur-berry")!;
    expect(splurgePrice(cheap.id)).toBe(splurge.price);
    expect(keptOn(cheap)).toBe(splurge.price - cheap.price);
    expect(keptOn(splurge)).toBe(0);
  });

  it("adds up across lipstick, hair dye and brows", () => {
    const lip = getProduct("db-berry")!, hair = hairFamily("copper")!.budget, brow = browFamily("auburn")!.budget;
    expect(keptTotal([lip, hair, brow])).toBe(keptOn(lip) + (hairFamily("copper")!.premium.price - hair.price) + (browFamily("auburn")!.premium.price - brow.price));
  });

  it("unknown products keep nothing", () => {
    expect(keptOn({ id: "nope", price: 5 })).toBe(0);
  });
});
