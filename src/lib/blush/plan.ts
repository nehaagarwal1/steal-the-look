// Blush matching: pure logic (no browser/server APIs), unit-tested.
//
// Blush blends over skin, so we model what a shade does to the cheeks:
//   tint(shade) ≈ base + strength × (shade color − bare cheek color)        (per Lab channel)
// base = the bare selfie's own cheek-vs-forehead tint; strength (how much of the
// color shows on these cheeks) is learned from the first real try-ons.

import { blushCatalog, type BlushProduct } from "@/data/blush-catalog";
import { hexToLab, type Lab } from "@/lib/color";
import { SAME_PHOTO_LIGHTNESS_WEIGHT, tintDifference as rawTintDifference, type BlushTint } from "@/lib/lips/measure";

/** All blush comparisons in the flow are on the same base photo, so lightness counts more. */
const tintDifference = (a: BlushTint, b: BlushTint) => rawTintDifference(a, b, SAME_PHOTO_LIGHTNESS_WEIGHT);

export type BlushStrength = { L: number; a: number; b: number };

/** Starting guess before any try-on, from the first real blush try-ons (2026-10-20). */
export const DEFAULT_STRENGTH: BlushStrength = { L: 0.15, a: 0.2, b: 0.2 };

/** Blush differences are smaller than lipstick ones, so blush gets its own scale. */
export const BLUSH_TRUE_DUPE = 2.5;
export type BlushVerdict = "looks the same" | "very close" | "close" | "noticeably different" | "different";

export function blushVerdict(diff: number): BlushVerdict {
  if (diff < 1.5) return "looks the same";
  if (diff < 3) return "very close";
  if (diff < 5) return "close";
  if (diff < 8) return "noticeably different";
  return "different";
}

/** 0-100: 100 at no difference, 0 at 12 or more. */
export const blushScore = (diff: number) => Math.max(0, Math.round(100 - diff * (100 / 12)));

export function predictTint(shadeHex: string, base: BlushTint, bareCheek: Lab, s: BlushStrength): BlushTint {
  const p = hexToLab(shadeHex);
  return { dL: base.dL + s.L * (p.L - bareCheek.L), da: base.da + s.a * (p.a - bareCheek.a), db: base.db + s.b * (p.b - bareCheek.b) };
}

export type BlushSample = { product: BlushProduct; tint: BlushTint };

/** Learns how strongly blush shows on these cheeks (least squares per channel, through the bare-cheek point). */
export function fitStrength(samples: BlushSample[], base: BlushTint, bareCheek: Lab): BlushStrength {
  const fit = (ch: "L" | "a" | "b", tk: "dL" | "da" | "db", fallback: number) => {
    let xy = 0, xx = 0;
    for (const s of samples) {
      const x = hexToLab(s.product.hex)[ch] - bareCheek[ch];
      const y = s.tint[tk] - base[tk];
      xy += x * y; xx += x * x;
    }
    if (xx < 25) return fallback; // shades too close to the skin color to learn from
    return Math.min(0.9, Math.max(0.03, xy / xx));
  };
  return { L: fit("L", "dL", DEFAULT_STRENGTH.L), a: fit("a", "da", DEFAULT_STRENGTH.a), b: fit("b", "db", DEFAULT_STRENGTH.b) };
}

function families(allowed?: Set<string>) {
  const map = new Map<string, BlushProduct[]>();
  for (const p of blushCatalog) {
    if (allowed && !allowed.has(p.id)) continue;
    map.set(p.family, [...(map.get(p.family) ?? []), p]);
  }
  return [...map.values()].map((members) => ({
    members,
    premium: members.reduce((a, b) => (b.price > a.price ? b : a)),
    cheapest: members.reduce((a, b) => (b.price < a.price ? b : a)),
  }));
}

/** Families ranked by how close their premium shade is predicted to land to the target tint. */
export function rankBlushFamilies(
  target: BlushTint, base: BlushTint, bareCheek: Lab, s: BlushStrength,
  { exclude, allowed }: { exclude?: Set<string>; allowed?: Set<string> } = {},
) {
  return families(allowed)
    .filter((f) => !exclude?.has(f.premium.family))
    .map((f) => ({ ...f, predicted: tintDifference(target, predictTint(f.premium.hex, base, bareCheek, s)) }))
    .sort((x, y) => x.predicted - y.predicted);
}

/** No (or barely any) blush in the look: matching would be noise. */
export const hasBlush = (target: BlushTint, base: BlushTint) => tintDifference(target, base) >= 1.5;

export type BlushCard = {
  product: BlushProduct;
  tint: BlushTint;
  diff: number;
  score: number;
  verdict: BlushVerdict;
  savings?: number;
  dupe?: { premiumId: string; diff: number; isTrueDupe: boolean };
};

/** Proof cards: each tried blush's tint vs the look's tint on the same cheeks; best first, cheapest on ties. */
export function buildBlushProof(target: BlushTint, measured: BlushSample[]): BlushCard[] {
  const premiumOf = new Map<string, BlushSample>();
  for (const m of measured) {
    const cur = premiumOf.get(m.product.family);
    if (!cur || m.product.price > cur.product.price) premiumOf.set(m.product.family, m);
  }
  return measured
    .map((m) => {
      const diff = tintDifference(target, m.tint);
      const card: BlushCard = { product: m.product, tint: m.tint, diff, score: blushScore(diff), verdict: blushVerdict(diff) };
      const prem = premiumOf.get(m.product.family);
      if (prem && prem.product.id !== m.product.id) {
        const d = tintDifference(prem.tint, m.tint);
        card.savings = prem.product.price - m.product.price;
        card.dupe = { premiumId: prem.product.id, diff: d, isTrueDupe: d < BLUSH_TRUE_DUPE };
      }
      return card;
    })
    .sort((a, b) => a.diff - b.diff || a.product.price - b.product.price);
}

/** Cheapest blush within reach of the best match. */
export function bestBlush(cards: BlushCard[], tolerance = 1): BlushCard | undefined {
  if (!cards.length) return undefined;
  const best = Math.min(...cards.map((c) => c.diff));
  return cards.filter((c) => c.diff <= best + tolerance).sort((a, b) => a.product.price - b.product.price)[0];
}
