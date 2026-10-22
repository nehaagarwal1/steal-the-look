// Text for the shareable result card. Pure, so it's unit-tested.

import type { ProofCard } from "@/lib/lips/plan";
import type { Finish } from "@/lib/lips/finish";

export type ShareFacts = {
  shade: string;
  brand: string;
  price: number;
  /** Price of the premium version of the same shade, when the match is a cheaper version. */
  premiumPrice?: number;
  score: number;
  /** The cheaper version measured the same as the premium one on the shopper's lips. */
  trueDupe: boolean;
  finish: Finish;
  /** The look's finish, when it differs from the shade's (shown on the card for honesty). */
  lookFinish?: Finish;
};

export function shareFacts(card: ProofCard, lookFinish?: Finish): ShareFacts {
  return {
    finish: card.finish,
    lookFinish: lookFinish && lookFinish !== card.finish ? lookFinish : undefined,
    shade: card.product.shade,
    brand: card.product.name,
    price: card.product.price,
    premiumPrice: card.savings ? card.product.price + card.savings : undefined,
    score: card.score,
    trueDupe: !!card.dupe?.isTrueDupe,
  };
}

/** Headline on the card: "$42 → $6" when there are savings, otherwise "$18". */
/** Big line on the card: the money kept, when there is a splurge version to compare with. */
export function priceHeadline(f: ShareFacts): string {
  return f.premiumPrice ? `I kept $${f.premiumPrice - f.price}` : `$${f.price}`;
}

/** Small line under the headline: both prices, as a choice rather than "cheap vs expensive". */
export function priceLine(f: ShareFacts): string | null {
  return f.premiumPrice ? `$${f.price} instead of $${f.premiumPrice}` : null;
}

/** Caption for posts and the image's alt text. */
export function shareCaption(f: ShareFacts): string {
  const money = f.premiumPrice
    ? f.trueDupe
      ? ` for $${f.price} and kept $${f.premiumPrice - f.price}: it looks the same on me as the $${f.premiumPrice} one`
      : ` for $${f.price} instead of $${f.premiumPrice}`
    : ` for $${f.price}`;
  return `Pretty looks, smart picks. I got this look${money}. ${f.shade}, ${f.score}% match on my own lips. #PrettySmart`;
}

/** "Matte finish (the look is glossy)" when the finishes differ, otherwise null. */
export function finishLine(f: ShareFacts): string | null {
  return f.lookFinish ? `${f.finish[0].toUpperCase()}${f.finish.slice(1)} finish (the look is ${f.lookFinish})` : null;
}
