// Ranks catalog lipsticks against a measured lip color, cheapest-first among close matches.
//
// Note: catalog hex values are the product's own color. On a face, YouCam's try-on
// blends that color with the natural lip, so this ranking is only a first pass to
// pick candidates. The real proof is measuring each candidate's try-on result.

import { catalog, type LipProduct } from "@/data/catalog";
import { deltaE2000 } from "@/lib/color";
import { matchScore, matchVerdict } from "./measure";

export type Candidate = {
  product: LipProduct;
  deltaE: number;
  score: number;
  verdict: ReturnType<typeof matchVerdict>;
};

export function rankLipsticks(measuredHex: string, products: LipProduct[] = lipsticks()): Candidate[] {
  return products
    .map((product) => {
      const dE = deltaE2000(measuredHex, product.hex);
      return { product, deltaE: Math.round(dE * 10) / 10, score: matchScore(dE), verdict: matchVerdict(dE) };
    })
    .sort((a, b) => a.deltaE - b.deltaE);
}

/** Among candidates within `tolerance` of the best match, cheapest first. */
export function cheapestCloseMatches(ranked: Candidate[], tolerance = 4): Candidate[] {
  if (!ranked.length) return [];
  const best = ranked[0].deltaE;
  return ranked.filter((c) => c.deltaE <= best + tolerance).sort((a, b) => a.product.price - b.product.price);
}

export function lipsticks(): LipProduct[] {
  return catalog.filter((p): p is LipProduct => p.kind === "lipstick");
}
