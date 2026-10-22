// Hair dye proof: pure logic (no browser APIs), unit-tested.
//
// Hair Color try-ons change only the hair, so the hair is found without a segmentation
// model: pixels that changed between the base photo and the dyed versions. Each version's
// hair color is the median color of those pixels, compared with CIEDE2000.

import { deltaE2000, labToHex, rgbToLab, type Lab } from "@/lib/color";
import type { Pixels } from "@/lib/lips/measure";

/** Below this on-hair difference the cheaper dye counts as a true dupe. */
export const HAIR_TRUE_DUPE = 3;
/** Sum of |ΔR|+|ΔG|+|ΔB| above which a pixel counts as recolored. */
const CHANGED = 36;
/** Less than this share of the photo recolored = hair not found reliably. */
const MIN_COVERAGE = 0.01;

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

/** `baseColor`: the hair (or brow) color before, in the same pixels. */
export type HairColors = { coverage: number; colors: string[]; baseColor: string; reliable: boolean };

/** Hair color of each dyed version (all the same size as `base`). */
/** Also used for brows (small area, subtler change): pass a lower `changed` and `minCoverage`. */
export function measureDyedHair(base: Pixels, dyed: Pixels[], { changed = CHANGED, minCoverage = MIN_COVERAGE } = {}): HairColors {
  const n = base.width * base.height;
  // YouCam results come back slightly brighter overall (~12/255 per channel, 2026-10-21), which alone can cross
  // the "changed" threshold. Estimate that global shift from the least-changed 40% of pixels and remove it first.
  const offsets = dyed.map((d) => {
    // Totals are 0..765, so a histogram finds the 40th-percentile cut without sorting ~800k pixels.
    const totals = new Uint16Array(n), hist = new Uint32Array(766);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const t = Math.abs(d.data[o] - base.data[o]) + Math.abs(d.data[o + 1] - base.data[o + 1]) + Math.abs(d.data[o + 2] - base.data[o + 2]);
      totals[i] = t; hist[t]++;
    }
    let cut = 0;
    for (let acc = 0; cut < 765 && acc + hist[cut] < n * 0.4; cut++) acc += hist[cut];
    const diffs: number[][] = [[], [], []];
    for (let i = 0; i < n; i++) if (totals[i] <= cut) for (let ch = 0; ch < 3; ch++) diffs[ch].push(d.data[i * 4 + ch] - base.data[i * 4 + ch]);
    return diffs.map((xs) => (xs.length ? median(xs) : 0));
  });
  const mask = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    for (let k = 0; k < dyed.length; k++) {
      const d = dyed[k], off = offsets[k];
      if (Math.abs(d.data[o] - base.data[o] - off[0]) + Math.abs(d.data[o + 1] - base.data[o + 1] - off[1]) + Math.abs(d.data[o + 2] - base.data[o + 2] - off[2]) > changed) {
        mask[i] = 1; count++; break;
      }
    }
  }
  const coverage = count / n;
  const colorOf = (d: Pixels) => {
    const labs: Lab[] = [];
    for (let i = 0; i < n; i++) if (mask[i]) { const o = i * 4; labs.push(rgbToLab(d.data[o], d.data[o + 1], d.data[o + 2])); }
    if (!labs.length) return "#000000";
    labs.sort((x, y) => x.L - y.L);
    const t = labs.slice(Math.floor(labs.length * 0.15), Math.ceil(labs.length * 0.85)); // drop shadows and shine
    return labToHex({ L: median(t.map((p) => p.L)), a: median(t.map((p) => p.a)), b: median(t.map((p) => p.b)) });
  };
  return { coverage: Math.round(coverage * 1000) / 1000, colors: dyed.map(colorOf), baseColor: colorOf(base), reliable: coverage >= minCoverage };
}

export type HairDupeVerdict = { deltaE: number; isTrueDupe: boolean; label: string };

export function hairDupe(premiumHex: string, budgetHex: string): HairDupeVerdict {
  const dE = Math.round(deltaE2000(premiumHex, budgetHex) * 10) / 10;
  const isTrueDupe = dE < HAIR_TRUE_DUPE;
  return {
    deltaE: dE,
    isTrueDupe,
    label: isTrueDupe ? "looks the same on me" : dE < 6 ? "slightly different on me" : "clearly different on me",
  };
}
