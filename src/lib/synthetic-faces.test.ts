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

describe("synthetic look photos", async () => {
  const { LOOK_PRESETS, lookPrompt, LOOK_NEGATIVE_PROMPT, MAX_PROMPT: MAX } = await import("./synthetic-faces");

  it("each preset has lipstick, blush and loose hair, within the API limits", () => {
    expect(new Set(LOOK_PRESETS.map((p) => p.id)).size).toBe(LOOK_PRESETS.length);
    for (const p of LOOK_PRESETS) {
      const prompt = lookPrompt(p);
      expect(prompt.length).toBeLessThanOrEqual(MAX);
      expect(prompt.endsWith(`${p.hair}.`)).toBe(true); // nothing cut off by the length limit
      expect(prompt).toMatch(/lipstick|lips/);
      expect(prompt).toMatch(/blush/);
      expect(prompt).toMatch(/shoulders visible/);
      expect(prompt).toMatch(/not covering the eyes/);
      expect(prompt).not.toMatch(/bare lips|no makeup/);
    }
    expect(LOOK_NEGATIVE_PROMPT.length).toBeLessThanOrEqual(500);
  });
});
