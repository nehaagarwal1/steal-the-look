// Pure logic for "Pretty Smart" lipstick matching: which shades to try, and how to
// turn on-face measurements into proof cards. No browser or server APIs.

import { catalog, type LipProduct } from "@/data/catalog";
import { deltaE2000, hexToLab, labToHex } from "@/lib/color";
import { matchScore, matchVerdict, type LipTones, type MatchVerdict } from "./measure";
import { finishDistance, productFinish, type Finish } from "./finish";
import { hueDifference } from "./explain";

const lipsticks = () => catalog.filter((p): p is LipProduct => p.kind === "lipstick");

/** True dupe threshold: under this, two shades look the same on the shopper's face. */
export const DUPE_DELTA_E = 4;

/** Ranking penalty per finish step (satin vs glossy = 1 step, matte vs glossy = 2), in color-difference units. */
export const FINISH_PENALTY = 2.5;

/**
 * Picks shades to try on: the closest `families` shade families to the look
 * (ranked by the premium version's color), and in each family the premium and
 * the cheapest version. Real-lipstick photos rank well against catalog colors,
 * so this cheap first pass is good enough to choose candidates.
 */
export function pickCandidates(
  lookHex: string,
  { families = 2, allowed, finish }: { families?: number; allowed?: Set<string>; finish?: Finish } = {},
): LipProduct[] {
  return closestFamilies(lookHex, { families, allowed, finish });
}

/**
 * Premium + cheapest of the `families` families whose premium color is closest to `hex`.
 * With `finish`, shades of a different finish rank as if they were a bit further away.
 */
function closestFamilies(
  hex: string,
  { families, allowed, exclude, finish }: { families: number; allowed?: Set<string>; exclude?: Set<string>; finish?: Finish },
): LipProduct[] {
  const byFamily = new Map<string, LipProduct[]>();
  for (const p of lipsticks()) {
    if (allowed && !allowed.has(p.id)) continue;
    const key = p.family ?? p.id;
    if (exclude?.has(key)) continue;
    byFamily.set(key, [...(byFamily.get(key) ?? []), p]);
  }
  return [...byFamily.values()]
    .map((members) => {
      const premium = members.reduce((a, b) => (b.price > a.price ? b : a));
      const penalty = finish ? FINISH_PENALTY * finishDistance(productFinish(premium.texture), finish) : 0;
      return { members, premium, deltaE: deltaE2000(hex, premium.hex) + penalty };
    })
    .sort((a, b) => a.deltaE - b.deltaE)
    .slice(0, families)
    .flatMap(({ members, premium }) => {
      const cheapest = members.reduce((a, b) => (b.price < a.price ? b : a));
      return cheapest.id === premium.id ? [premium] : [premium, cheapest];
    });
}

/**
 * Calibrates to the shopper's lips. Try-ons render differently on each face
 * (natural lip color, lighting), so after a first round we estimate the shift
 * "catalog color -> color on these lips", weighting shades that landed near the
 * target most, and look for the shade whose catalog color minus that shift
 * would land on the target. Returns new shades to try (premium + cheapest).
 */
/** How catalog colors shift when rendered on one shopper's lips (Lab offsets). */
export type LipShift = { L: number; a: number; b: number };

/**
 * Estimates the shift "catalog color -> color on these lips" from measured
 * try-ons, trusting shades that landed close to the target most.
 * Returns null when nothing was measured.
 */
export function estimateShift(targetHex: string, measured: Measured[]): LipShift | null {
  let wSum = 0;
  const shift = { L: 0, a: 0, b: 0 };
  for (const m of measured) {
    const r = hexToLab(m.hex), c = hexToLab(m.product.hex);
    const w = 1 / (1 + deltaE2000(targetHex, m.hex));
    shift.L += w * (r.L - c.L); shift.a += w * (r.a - c.a); shift.b += w * (r.b - c.b);
    wSum += w;
  }
  if (wSum === 0) return null;
  return { L: shift.L / wSum, a: shift.a / wSum, b: shift.b / wSum };
}

/** Shades whose catalog color, shifted the way it will be on these lips, lands closest to the target. */
export function pickCalibrated(
  targetHex: string,
  shift: LipShift,
  { families = 2, allowed, finish, exclude }: { families?: number; allowed?: Set<string>; finish?: Finish; exclude?: Set<string> } = {},
): LipProduct[] {
  const t = hexToLab(targetHex);
  const wanted = labToHex({ L: t.L - shift.L, a: t.a - shift.a, b: t.b - shift.b });
  return closestFamilies(wanted, { families, allowed, exclude, finish });
}

/**
 * Calibrates to the shopper's lips. Try-ons render differently on each face
 * (natural lip color, lighting), so after a first round we estimate the shift
 * and look for the shade whose catalog color would land on the target.
 * Returns new shades to try (premium + cheapest), never re-trying a family.
 */
export function refineCandidates(
  targetHex: string,
  measured: Measured[],
  { families = 1, allowed, finish }: { families?: number; allowed?: Set<string>; finish?: Finish } = {},
): { picks: LipProduct[]; shift: LipShift } {
  const shift = estimateShift(targetHex, measured);
  if (!shift) return { picks: [], shift: { L: 0, a: 0, b: 0 } };
  const tried = new Set(measured.map((m) => m.product.family ?? m.product.id));
  return { picks: pickCalibrated(targetHex, shift, { families, allowed, finish, exclude: tried }), shift };
}

/** A saved lip profile: the averaged shift plus how many looks it's based on. */
export type LipProfile = { shift: LipShift; looks: number; updatedAt: string };

/** Folds a new session's shift into the profile (running average, so each look counts equally). */
export function mergeProfile(prev: LipProfile | null, shift: LipShift, now = new Date()): LipProfile {
  if (!prev) return { shift, looks: 1, updatedAt: now.toISOString() };
  const n = prev.looks;
  const avg = (a: number, b: number) => (a * n + b) / (n + 1);
  return {
    shift: { L: avg(prev.shift.L, shift.L), a: avg(prev.shift.a, shift.a), b: avg(prev.shift.b, shift.b) },
    looks: n + 1,
    updatedAt: now.toISOString(),
  };
}

export type Measured = { product: LipProduct; hex: string; tones?: LipTones };

/** When the light/dark contrast is this much lower than the look's, the shade reads "flatter". */
export const FLATTER_GAP = 3;

/**
 * On-face difference between two measured lips. The middle color alone can match while the
 * light and dark parts don't (e.g. a two-tone or metallic look vs a flat lipstick), so when
 * tones are known the difference is the larger of the middle-color ΔE and the average tone ΔE.
 */
export function lipDifference(a: { hex: string; tones?: LipTones }, b: { hex: string; tones?: LipTones }) {
  const middle = deltaE2000(a.hex, b.hex);
  if (!a.tones || !b.tones) return { deltaE: middle };
  const dark = deltaE2000(a.tones.dark, b.tones.dark), light = deltaE2000(a.tones.light, b.tones.light);
  const gap = (t: LipTones) => deltaE2000(t.dark, t.light);
  return {
    deltaE: Math.max(middle, (dark + light) / 2),
    tones: { middle: round1(middle), dark: round1(dark), light: round1(light), flatter: gap(b.tones) < gap(a.tones) - FLATTER_GAP },
  };
}

export type ProofCard = {
  product: LipProduct;
  /** This shade's color as measured on the shopper's lips. */
  hex: string;
  /** Difference between this shade on the shopper and the look on the shopper. */
  deltaE: number;
  score: number;
  verdict: MatchVerdict;
  /** Savings against the premium shade of the same family, if this is a cheaper version. */
  savings?: number;
  /** For cheaper versions: how it compares on-face to the premium version. */
  dupe?: { premiumId: string; deltaE: number; isTrueDupe: boolean };
  /** The product's finish, and whether it matches the look's finish (when known). */
  finish: Finish;
  finishMatch?: boolean;
  /** Per-part differences (when tones were measured); `flatter` = less light/dark contrast than the look. */
  tones?: { middle: number; dark: number; light: number; flatter: boolean };
};

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Builds proof cards from on-face measurements, best match first, cheapest first on ties. */
export function buildProof(targetHex: string, measured: Measured[], targetFinish?: Finish, targetTones?: LipTones): ProofCard[] {
  const premiumByFamily = new Map<string, Measured>();
  for (const m of measured) {
    const key = m.product.family ?? m.product.id;
    const cur = premiumByFamily.get(key);
    if (!cur || m.product.price > cur.product.price) premiumByFamily.set(key, m);
  }

  return measured
    .map((m) => {
      const diff = lipDifference({ hex: targetHex, tones: targetTones }, m);
      const dE = diff.deltaE;
      const finish = productFinish(m.product.texture);
      const card: ProofCard = {
        product: m.product, hex: m.hex, deltaE: round1(dE), score: matchScore(dE), verdict: matchVerdict(dE),
        finish, finishMatch: targetFinish ? finish === targetFinish : undefined,
        ...(diff.tones ? { tones: diff.tones } : {}),
      };
      const premium = premiumByFamily.get(m.product.family ?? m.product.id);
      if (premium && premium.product.id !== m.product.id) {
        const vs = lipDifference(premium, m).deltaE;
        card.savings = premium.product.price - m.product.price;
        card.dupe = { premiumId: premium.product.id, deltaE: round1(vs), isTrueDupe: vs < DUPE_DELTA_E };
      }
      return card;
    })
    .sort((a, b) => a.deltaE - b.deltaE || a.product.price - b.product.price);
}

/** A shade whose hue is this much further off than the closest-hue candidate isn't recommended on price alone. */
export const HUE_SLACK = 2;

/**
 * The recommendation: among shades that match the look about as well as the best one
 * and whose hue isn't clearly further off (e.g. a cheaper berry for an orange-red look),
 * prefer the same finish as the look, then the lowest price.
 */
export function bestBuy(cards: ProofCard[], tolerance = 1.5, targetHex?: string): ProofCard | undefined {
  if (!cards.length) return undefined;
  const best = Math.min(...cards.map((c) => c.deltaE));
  let close = cards.filter((c) => c.deltaE <= best + tolerance);
  if (targetHex) {
    const hue = (c: ProofCard) => Math.abs(hueDifference(targetHex, c.hex));
    const minHue = Math.min(...close.map(hue));
    close = close.filter((c) => hue(c) <= minHue + HUE_SLACK);
  }
  return close
    .sort((a, b) => Number(b.finishMatch ?? false) - Number(a.finishMatch ?? false) || a.product.price - b.product.price)[0];
}

/** Shades at or beyond this difference are tucked away under "other shades tried". */
export const WEAK_MATCH_DELTA_E = 7;

export type ShadeGroup<C extends ProofCard = ProofCard> = {
  family: string;
  shade: string;
  /** Best-matching variant in the family. */
  best: C;
  /** All price versions, most expensive first. */
  variants: C[];
  weak: boolean;
};

/** Groups proof cards by shade family (premium and dupe side by side), best family first. */
export function groupByFamily<C extends ProofCard>(cards: C[]): ShadeGroup<C>[] {
  const map = new Map<string, C[]>();
  for (const c of cards) {
    const key = c.product.family ?? c.product.id;
    map.set(key, [...(map.get(key) ?? []), c]);
  }
  return [...map.entries()]
    .map(([family, variants]) => {
      const best = variants.reduce((a, b) => (b.deltaE < a.deltaE || (b.deltaE === a.deltaE && b.product.price < a.product.price) ? b : a));
      return {
        family,
        shade: variants[0].product.shade,
        best,
        variants: [...variants].sort((a, b) => b.product.price - a.product.price),
        weak: best.deltaE >= WEAK_MATCH_DELTA_E,
      };
    })
    .sort((a, b) => a.best.deltaE - b.best.deltaE);
}
