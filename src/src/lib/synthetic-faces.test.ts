import { describe, expect, it } from "vitest";
import { FACE_PRESETS, facePrompt, MAX_PROMPT, NEGATIVE_PROMPT, sourceFromFilename } from "./synthetic-faces";

describe("synthetic face prompts", () => {
  it("covers several regions with distinct natural lip tones", () => {
    expect(FACE_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(FACE_PRESETS.map((p) => p.id)).size).toBe(FACE_PRESETS.length);
    for (const p of FACE_PRESETS) expect(p.description).toMatch(/lips/);
  });

  it("always asks for an audit-ready photo, within the API's limits", () => {
    for (const p of FACE_PRESETS) {
      const prompt = facePrompt(p.description);
      expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT);
      expect(prompt).toMatch(/bare lips/);
      expect(prompt).toMatch(/no glasses/);
      expect(prompt).toMatch(/facing the camera/);
    }
    expect(NEGATIVE_PROMPT.length).toBeLessThanOrEqual(500);
  });

  it("truncates very long custom descriptions", () => {
    expect(facePrompt("x".repeat(2000)).length).toBe(MAX_PROMPT);
  });

  it("labels faces by filename", () => {
    expect(sourceFromFilename("synthetic-south-asian-1792000000000.jpg")).toBe("synthetic");
    expect(sourceFromFilename("me-noglasses.jpeg")).toBe("real");
  });
});
