import { describe, expect, it } from "vitest";
import { pickVideoType, TWINNING_SECONDS, twinningFrame, twinningNameLine, twinningSubtitle } from "./twinning";

describe("twinning timeline", () => {
  it("starts empty and ends fully shown", () => {
    expect(twinningFrame(0)).toEqual({ slide: 0, lean: 0, sparkle: 0, title: 0, subtitle: 0 });
    expect(twinningFrame(TWINNING_SECONDS)).toEqual({ slide: 1, lean: 1, sparkle: 1, title: 1, subtitle: 1 });
  });

  it("runs in order: photos, then the title, then the savings line", () => {
    const f = twinningFrame(2.5);
    expect(f.slide).toBe(1);
    expect(f.title).toBeGreaterThan(0);
    expect(f.subtitle).toBe(0);
  });
});

describe("twinning text", () => {
  it("shows the money kept, or a fallback", () => {
    expect(twinningSubtitle(82)).toBe("Same look. I kept $82.");
    expect(twinningSubtitle(0)).toBe("Same look. Proven on me.");
  });

  it("adds a name line only with a name", () => {
    expect(twinningNameLine("Neha")).toBe("Neha, nailed it 💅");
    expect(twinningNameLine("")).toBe("");
  });

  it("picks MP4 when available (Safari), else WebM, else nothing", () => {
    expect(pickVideoType((t) => t.startsWith("video/mp4"))?.ext).toBe("mp4");
    expect(pickVideoType((t) => t === "video/webm")?.ext).toBe("webm");
    expect(pickVideoType(() => false)).toBeNull();
  });
});
