// "I keep $X": how much a pick saves against the splurge (most expensive) version of the
// same shade, across lipstick, blush, hair dye and brow catalogs. Pure, unit-tested.

import { catalog } from "@/data/catalog";
import { blushCatalog } from "@/data/blush-catalog";
import { hairCatalog } from "@/data/hair-catalog";
import { browCatalog } from "@/data/brow-catalog";

type Item = { id: string; price: number; family?: string };
const all: (Item & { kind: string })[] = [
  ...catalog.map((p) => ({ ...p, kind: "lip" })),
  ...blushCatalog.map((p) => ({ ...p, kind: "blush" })),
  ...hairCatalog.map((p) => ({ ...p, kind: "hair" })),
  ...browCatalog.map((p) => ({ ...p, kind: "brow" })),
];

/** Price of the splurge version of this product's shade (itself if it is the splurge or unknown). */
export function splurgePrice(id: string): number | undefined {
  const p = all.find((x) => x.id === id);
  if (!p) return undefined;
  const family = p.family ?? p.id;
  return Math.max(...all.filter((x) => x.kind === p.kind && (x.family ?? x.id) === family).map((x) => x.price));
}

/** Money kept by choosing this product over its splurge version. */
export function keptOn(item: { id: string; price: number }): number {
  const top = splurgePrice(item.id);
  return top ? Math.max(0, top - item.price) : 0;
}

export const keptTotal = (items: { id: string; price: number }[]) => items.reduce((sum, i) => sum + keptOn(i), 0);
