// "Twinning ✨" ending: the timeline of the reveal animation. Pure, unit-tested;
// the drawing itself lives in src/app/twinning.tsx.

/** Total length of the reveal (and of the saved video), seconds. */
export const TWINNING_SECONDS = 6;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Ease-out cubic: fast start, gentle stop. */
export const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
/** Progress 0..1 of a step running from `from` to `to` seconds. */
export const phase = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));

export type TwinningFrame = {
  /** 0 = off screen, 1 = in place (both photos slide in together). */
  slide: number;
  /** 0..1 lean of the two photos toward each other. */
  lean: number;
  /** 0..1 sparkle burst between the photos (then they keep twinkling). */
  sparkle: number;
  /** 0..1 "Twinning ✨" caption. */
  title: number;
  /** 0..1 "Same look. I kept $X." (and the name line). */
  subtitle: number;
};

/** Steps: slide in (0-1.2s) → lean in (0.9-1.8s) → sparkles (1.4-2.4s) → title (2.2-3.0s) → subtitle (3.0-3.8s) → hold. */
export function twinningFrame(t: number): TwinningFrame {
  return {
    slide: easeOut(phase(t, 0, 1.2)),
    lean: easeOut(phase(t, 0.9, 1.8)),
    sparkle: phase(t, 1.4, 2.4),
    title: easeOut(phase(t, 2.2, 3.0)),
    subtitle: easeOut(phase(t, 3.0, 3.8)),
  };
}

/** Bottom line of the card: the money kept, or a fallback when nothing was kept. */
export function twinningSubtitle(kept: number): string {
  return kept > 0 ? `Same look. I kept $${kept}.` : "Same look. Proven on me.";
}

/** Optional personal line, only when a first name was given. */
export const twinningNameLine = (name: string) => (name ? `${name}, nailed it 💅` : "");

/** First video type this browser can record (MP4 on Safari, WebM elsewhere), or null. */
export function pickVideoType(isSupported: (type: string) => boolean): { mime: string; ext: string } | null {
  for (const [mime, ext] of [["video/mp4;codecs=avc1", "mp4"], ["video/mp4", "mp4"], ["video/webm;codecs=vp9", "webm"], ["video/webm", "webm"]] as const) {
    if (isSupported(mime)) return { mime, ext };
  }
  return null;
}
