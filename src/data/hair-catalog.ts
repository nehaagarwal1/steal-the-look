// Hair dye catalog: fictional brands, three price tiers per shade family (like the
// lipsticks and blushes). Cheaper versions are small color shifts of the salon shade;
// a few are deliberately "marketed dupes" that measurably differ.

import { offset, seeded, shift } from "./catalog";

export type HairDye = {
  id: string;
  kind: "hair";
  name: string;
  shade: string;
  hex: string;
  price: number;
  family: string;
};

type Tier = { brand: string; line: string; prices: number[]; idPrefix: string };
const LUXE: Tier = { brand: "Maison Aurelle", line: "Salon Color", prices: [32, 36, 38, 42, 48], idPrefix: "aurh" };
const MID: Tier = { brand: "Lumen", line: "Gloss Color", prices: [14, 16, 18, 20, 22], idPrefix: "lumh" };
const BASIC: Tier = { brand: "Daily Basics", line: "Box Dye", prices: [6, 7, 8, 9, 10], idPrefix: "dbh" };

const FAMILIES: { key: string; shade: string; hex: string; fakeDupe?: boolean }[] = [
  { key: "jet-black", shade: "Jet Black", hex: "#1B1B1E" },
  { key: "espresso", shade: "Espresso Brown", hex: "#3B2A22" },
  { key: "chocolate", shade: "Chocolate Brown", hex: "#5A3A29" },
  { key: "chestnut", shade: "Chestnut", hex: "#7A4A2E", fakeDupe: true },
  { key: "caramel", shade: "Caramel", hex: "#A86B3C" },
  { key: "honey-blonde", shade: "Honey Blonde", hex: "#C99A5B" },
  { key: "copper", shade: "Copper Red", hex: "#B5512B" },
  { key: "auburn", shade: "Auburn", hex: "#7E2F22", fakeDupe: true },
  { key: "burgundy", shade: "Burgundy", hex: "#6B1F33" },
  { key: "plum", shade: "Plum Violet", hex: "#5B2A4E", fakeDupe: true },
  { key: "ash-brown", shade: "Ash Brown", hex: "#6E6258" },
  { key: "rose-gold", shade: "Rose Gold", hex: "#C98B7E" },
];

const pick = (prices: number[], key: string) => prices[Math.floor(seeded(key, 29) * prices.length)];

export const hairCatalog: HairDye[] = FAMILIES.flatMap((f) => {
  const mid = shift(f.hex, offset(`h:${f.key}`, 0.8 + seeded(f.key, 53) * 1.2, 59));
  // A fake dupe lands visibly warmer/cooler and lighter, which is how cheap box dyes usually go wrong.
  const theta = seeded(f.key, 61) * Math.PI * 2;
  const fake: [number, number, number] = [7, 14 * Math.cos(theta), 14 * Math.sin(theta)];
  const basic = shift(f.hex, f.fakeDupe ? fake : offset(`h:${f.key}`, 1.2 + seeded(f.key, 67) * 1.3, 71));
  return ([[LUXE, f.hex], [MID, mid], [BASIC, basic]] as const).map(([tier, hex]) => ({
    id: `${tier.idPrefix}-${f.key}`,
    kind: "hair" as const,
    name: `${tier.brand} ${tier.line}`,
    shade: f.shade,
    hex,
    price: pick(tier.prices, `${tier.idPrefix}:${f.key}`),
    family: f.key,
  }));
});

export const getHairDye = (id: string) => hairCatalog.find((h) => h.id === id);

/** Salon (most expensive) and budget (cheapest) versions of a shade family. */
export function hairFamily(family: string): { premium: HairDye; budget: HairDye; all: HairDye[] } | undefined {
  const all = hairCatalog.filter((h) => h.family === family);
  if (!all.length) return undefined;
  const byPrice = [...all].sort((a, b) => b.price - a.price);
  return { premium: byPrice[0], budget: byPrice[byPrice.length - 1], all };
}

export const HAIR_FAMILIES = FAMILIES.map((f) => ({ key: f.key, shade: f.shade, hex: f.hex }));
