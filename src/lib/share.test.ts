import { describe, expect, it } from "vitest";
import { finishLine, priceHeadline, shareCaption, type ShareFacts } from "./share";

const dupe: ShareFacts = { shade: "Pink No. 207", brand: "Daily Basics Color Stick", price: 6, premiumPrice: 42, score: 82, trueDupe: true, finish: "matte", lookFinish: "glossy" };
const full: ShareFacts = { shade: "Berry No. 203", brand: "Maison Aurelle Rouge Couture", price: 42, score: 73, trueDupe: false, finish: "glossy" };

describe("share text", () => {
  it("shows the saving in the headline", () => {
    expect(priceHeadline(dupe)).toBe("$42 → $6");
    expect(priceHeadline(full)).toBe("$42");
  });

  it("writes an honest caption", () => {
    expect(shareCaption(dupe)).toBe(
      "I stole this look for $6 instead of $42, and it looks the same as the pricier version on me: Pink No. 207, 82% match on my own lips. #StealTheLook",
    );
    expect(shareCaption(full)).toBe("I stole this look for $42: Berry No. 203, 73% match on my own lips. #StealTheLook");
  });

  it("notes a finish mismatch, and nothing when finishes match", () => {
    expect(finishLine(dupe)).toBe("Matte finish (the look is glossy)");
    expect(finishLine(full)).toBeNull();
  });

  it("only claims 'looks the same' for true dupes", () => {
    expect(shareCaption({ ...dupe, trueDupe: false })).not.toMatch(/looks the same/);
  });
});
