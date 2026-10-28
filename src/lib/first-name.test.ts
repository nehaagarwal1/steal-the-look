import { describe, expect, it } from "vitest";
import { cleanFirstName, greetingName } from "./first-name";

describe("first name", () => {
  it("keeps real names, including accents and hyphens", () => {
    expect(cleanFirstName("  Neha ")).toBe("Neha");
    expect(cleanFirstName("Zoë-Anne")).toBe("Zoë-Anne");
    expect(cleanFirstName("O'Neil")).toBe("O'Neil");
  });

  it("drops markup, digits and extra spaces, and caps the length", () => {
    expect(cleanFirstName("<b>Neha</b>")).toBe("bNehab");
    expect(cleanFirstName("Ne  ha 123")).toBe("Ne ha");
    expect(cleanFirstName("a".repeat(50))).toHaveLength(30);
  });

  it("falls back to 'gorgeous'", () => {
    expect(greetingName("")).toBe("gorgeous");
    expect(greetingName("Neha")).toBe("Neha");
  });
});
