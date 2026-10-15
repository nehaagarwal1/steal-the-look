// Pure logic for "Steal the Look, for Less": which shades to try, and how to
// turn on-face measurements into proof cards. No browser or server APIs.

import { catalog, type LipProduct } from "@/data/catalog";
import { deltaE2000, hexToLab, labToHex } from "@/lib/color";
import { matchScore, matchVerdict, type MatchVerdict } from "./measure";

const lipsticks = () => catalog.filter((p): p is LipProduct => p.kind === "lipstick");

/** True dupe threshold: under this, two shades look the same on the shopper's face. */
export const DUPE_DELTA_E = 4;

/**
 * Picks shades to try on: the closest `families` shade families to the look
 * (ranked by the premium version's color), and in each family the premium and
 * the cheapest version. Real-lipstick photos rank well against catalog colors,
 * so this cheap first pass is good enough to choose candidates.
 */
export function pickCandidates(lookHex: string, { families = 2, allowed }: { families?: number; allowed?: Set<string> } = {}): LipProduct[] {
  return closestFamilies(lookHex, { families, allowed });
}

/** Premium + cheapest of the `families` families whose premium color is closest to `hex`. */
function closestFamilies(hex: string, { families, allowed, exclude }: { families: number; allowed?: Set<string>; exclude?: Set<string> }): LipProduct[] {
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
      return { members, premium, deltaE: deltaE2000(hex, premium.hex) };
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
export function refineCandidates(
  targetHex: string,
  measured: Measured[],
  { families = 1, allowed }: { families?: number; allowed?: Set<string> } = {},
): { picks: LipProduct[]; shift: { L: number; a: number; b: number } } {
  const t = hexToLab(targetHex);
  let wSum = 0;
  const shift = { L: 0, a: 0, b: 0 };
  for (const m of measured) {
    const r = hexToLab(m.hex), c = hexToLab(m.product.hex);
    const w = 1 / (1 + deltaE2000(targetHex, m.hex)); // trust shades that landed close
    shift.L += w * (r.L - c.L); shift.a += w * (r.a - c.a); shift.b += w * (r.b - c.b);
    wSum += w;
  }
  if (wSum === 0) return { picks: [], shift };
  shift.L /= wSum; shift.a /= wSum; shift.b /= wSum;
  const wanted = labToHex({ L: t.L - shift.L, a: t.a - shift.a, b: t.b - shift.b });
  const tried = new Set(measured.map((m) => m.product.family ?? m.product.id));
  return { picks: closestFamilies(wanted, { families, allowed, exclude: tried }), shift };
}

export type Measured = { product: LipProduct; hex: string };

export type ProofCard = {
  product: LipProduct;
  /** Difference between this shade on the shopper and the look on the shopper. */
  deltaE: number;
  score: number;
  verdict: MatchVerdict;
  /** Savings against the premium shade of the same family, if this is a cheaper version. */
  savings?: number;
  /** For cheaper versions: how it compares on-face to the premium version. */
  dupe?: { premiumId: string; deltaE: number; isTrueDupe: boolean };
};

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Builds proof cards from on-face measurements, best match first, cheapest first on ties. */
export function buildProof(targetHex: string, measured: Measured[]): ProofCard[] {
  const premiumByFamily = new Map<string, Measured>();
  for (const m of measured) {
    const key = m.product.family ?? m.product.id;
    const cur = premiumByFamily.get(key);
    if (!cur || m.product.price > cur.product.price) premiumByFamily.set(key, m);
  }

  return measured
    .map((m) => {
      const dE = deltaE2000(targetHex, m.hex);
      const card: ProofCard = { product: m.product, deltaE: round1(dE), score: matchScore(dE), verdict: matchVerdict(dE) };
      const premium = premiumByFamily.get(m.product.family ?? m.product.id);
      if (premium && premium.product.id !== m.product.id) {
        const vs = deltaE2000(premium.hex, m.hex);
        card.savings = premium.product.price - m.product.price;
        card.dupe = { premiumId: premium.product.id, deltaE: round1(vs), isTrueDupe: vs < DUPE_DELTA_E };
      }
      return card;
    })
    .sort((a, b) => a.deltaE - b.deltaE || a.product.price - b.product.price);
}

/** The recommendation: the cheapest shade that matches the look about as well as the best one. */
export function bestBuy(cards: ProofCard[], tolerance = 1.5): ProofCard | undefined {
  if (!cards.length) return undefined;
  const best = cards[0].deltaE;
  return cards.filter((c) => c.deltaE <= best + tolerance).sort((a, b) => a.product.price - b.product.price)[0];
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
