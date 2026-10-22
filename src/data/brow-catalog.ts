// Brow color catalog (tinted brow gels and pencils): fictional brands, a premium and a
// budget version per shade. One budget version is a deliberate "marketed dupe" that differs.

import { offset, seeded, shift } from "./catalog";

export type BrowProduct = {
  id: string;
  kind: "brow";
  name: string;
  shade: string;
  hex: string;
  price: number;
  family: string;
};

type Tier = { brand: string; line: string; prices: number[]; idPrefix: string };
const LUXE: Tier = { brand: "Maison Aurelle", line: "Brow Gel", prices: [24, 26, 28, 32], idPrefix: "aurw" };
const BASIC: Tier = { brand: "Daily Basics", line: "Brow Pencil", prices: [4, 5, 6, 8], idPrefix: "dbw" };

const FAMILIES: { key: string; shade: string; hex: string; fakeDupe?: boolean }[] = [
  { key: "soft-black", shade: "Soft Black", hex: "#2B2522" },
  { key: "dark-brown", shade: "Dark Brown", hex: "#3E2C23" },
  { key: "medium-brown", shade: "Medium Brown", hex: "#5C4232" },
  { key: "taupe", shade: "Taupe", hex: "#6E5E52", fakeDupe: true },
  { key: "ash-blonde", shade: "Ash Blonde", hex: "#8A7A66" },
  { key: "honey-blonde", shade: "Honey Blonde", hex: "#A07D55" },
  { key: "auburn", shade: "Auburn", hex: "#7A4030" },
  { key: "soft-copper", shade: "Soft Copper", hex: "#94573A" },
];

const pick = (prices: number[], key: string) => prices[Math.floor(seeded(key, 73) * prices.length)];

export const browCatalog: BrowProduct[] = FAMILIES.flatMap((f) => {
  const theta = seeded(f.key, 79) * Math.PI * 2;
  const basic = shift(f.hex, f.fakeDupe ? [8, 12 * Math.cos(theta), 12 * Math.sin(theta)] : offset(`w:${f.key}`, 1 + seeded(f.key, 83), 89));
  return ([[LUXE, f.hex], [BASIC, basic]] as const).map(([tier, hex]) => ({
    id: `${tier.idPrefix}-${f.key}`,
    kind: "brow" as const,
    name: `${tier.brand} ${tier.line}`,
    shade: f.shade,
    hex,
    price: pick(tier.prices, `${tier.idPrefix}:${f.key}`),
    family: f.key,
  }));
});

export const getBrow = (id: string) => browCatalog.find((b) => b.id === id);

export function browFamily(family: string): { premium: BrowProduct; budget: BrowProduct } | undefined {
  const all = browCatalog.filter((b) => b.family === family);
  if (all.length < 2) return undefined;
  const byPrice = [...all].sort((a, b) => b.price - a.price);
  return { premium: byPrice[0], budget: byPrice[byPrice.length - 1] };
}

export const BROW_FAMILIES = FAMILIES.map((f) => ({ key: f.key, shade: f.shade, hex: f.hex }));
