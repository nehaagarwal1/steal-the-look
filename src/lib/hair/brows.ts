// Brow shade advice after a hair color change. Pure, unit-tested.
//
// Common stylist guidance: brows about 1-2 shades darker than light hair, about the same
// or slightly lighter than very dark hair, and a softer (less vivid) version of red hair.

import { BROW_FAMILIES } from "@/data/brow-catalog";
import { deltaE2000, hexToLab, labToHex } from "@/lib/color";

/** Hair color change (CIEDE2000) above which brows usually need adjusting. */
export const BIG_HAIR_CHANGE = 15;

export function idealBrowColor(hairHex: string): string {
  const h = hexToLab(hairHex);
  const L = h.L >= 50 ? h.L - 14 : h.L >= 35 ? h.L - 8 : h.L < 22 ? h.L + 4 : h.L - 3;
  return labToHex({ L, a: h.a * 0.7, b: h.b * 0.7 });
}

export type BrowAdvice = { family: string; shade: string; needed: boolean; reason: string };

/** Which brow shade suits the new hair, and whether the change is big enough to bother. */
export function adviseBrows(currentHairHex: string, newHairHex: string): BrowAdvice {
  const ideal = idealBrowColor(newHairHex);
  const best = [...BROW_FAMILIES].sort((x, y) => deltaE2000(ideal, x.hex) - deltaE2000(ideal, y.hex))[0];
  const change = deltaE2000(currentHairHex, newHairHex);
  const needed = change >= BIG_HAIR_CHANGE;
  const lighter = hexToLab(newHairHex).L > hexToLab(currentHairHex).L;
  return {
    family: best.key,
    shade: best.shade,
    needed,
    reason: needed
      ? `A big change from my current hair, so my natural brows may look ${lighter ? "too dark" : "off"} with it. ${best.shade} goes with this color.`
      : `A small change: my natural brows will usually look fine. ${best.shade} is the closest brow shade if I want to match.`,
  };
}
