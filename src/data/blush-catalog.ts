// Blush catalog: fictional brands, three price tiers per shade family (like the
// lipsticks). Cheaper versions are small color shifts of the premium shade;
// a few are deliberately "marketed dupes" that measurably differ.

import { offset, seeded, shift } from "./catalog";
import type { BlushTexture } from "@/lib/lips/palette";

export type BlushProduct = {
  id: string;
  kind: "blush";
  name: string;
  shade: string;
  hex: string;
  texture: BlushTexture;
  price: number;
  family: string;
};

type Tier = { brand: string; line: string; prices: number[]; idPrefix: string };
const LUXE: Tier = { brand: "Maison Aurelle", line: "Joues Couture", prices: [32, 36, 38, 42, 46], idPrefix: "aurb" };
const MID: Tier = { brand: "Lumen", line: "Cheek Tint", prices: [12, 14, 16, 18, 20], idPrefix: "lumb" };
const BASIC: Tier = { brand: "Daily Basics", line: "Blush Stick", prices: [4, 5, 6, 7, 8, 9], idPrefix: "dbb" };

const FAMILIES: { key: string; shade: string; hex: string; texture: BlushTexture; fakeDupe?: boolean }[] = [
  { key: "ballet-pink", shade: "Ballet Pink", hex: "#F2A1B0", texture: "matte" },
  { key: "rose-petal", shade: "Rose Petal", hex: "#E07A8F", texture: "satin" },
  { key: "candy", shade: "Candy Pop", hex: "#FF7FA6", texture: "matte", fakeDupe: true },
  { key: "berry-flush", shade: "Berry Flush", hex: "#B5476A", texture: "matte" },
  { key: "plum-dusk", shade: "Plum Dusk", hex: "#8E4A6B", texture: "satin" },
  { key: "mauve-mist", shade: "Mauve Mist", hex: "#C08497", texture: "matte" },
  { key: "nude-blush", shade: "Nude Blush", hex: "#D99A8A", texture: "matte" },
  { key: "peach-glow", shade: "Peach Glow", hex: "#F4A582", texture: "satin" },
  { key: "apricot", shade: "Apricot Shimmer", hex: "#F0A070", texture: "shimmer", fakeDupe: true },
  { key: "coral-pop", shade: "Coral Pop", hex: "#F27F6B", texture: "matte" },
  { key: "tangerine", shade: "Tangerine", hex: "#F48A4A", texture: "satin" },
  { key: "terracotta", shade: "Terracotta", hex: "#C8694D", texture: "matte", fakeDupe: true },
  { key: "brick-rose", shade: "Brick Rose", hex: "#B8574F", texture: "satin" },
  { key: "bronze-sun", shade: "Bronze Sun", hex: "#B97A57", texture: "shimmer" },
];

const pick = (prices: number[], key: string) => prices[Math.floor(seeded(key, 23) * prices.length)];

export const blushCatalog: BlushProduct[] = FAMILIES.flatMap((f) => {
  const mid = shift(f.hex, offset(`b:${f.key}`, 0.8 + seeded(f.key, 31) * 1.2, 37));
  // Only ~20-30% of a blush's color shows over skin, so a fake dupe must differ a lot
  // in the pan, mostly in hue/saturation (what makes blush look "off"); true dupes stay within ~3.
  const theta = seeded(f.key, 47) * Math.PI * 2;
  const fake: [number, number, number] = [-3, 20 * Math.cos(theta), 20 * Math.sin(theta)];
  const basic = shift(f.hex, f.fakeDupe ? fake : offset(`b:${f.key}`, 1.5 + seeded(f.key, 41) * 1.5, 43));
  return ([[LUXE, f.hex], [MID, mid], [BASIC, basic]] as const).map(([tier, hex]) => ({
    id: `${tier.idPrefix}-${f.key}`,
    kind: "blush" as const,
    name: `${tier.brand} ${tier.line}`,
    shade: f.shade,
    hex,
    texture: f.texture,
    price: pick(tier.prices, `${tier.idPrefix}:${f.key}`),
    family: f.key,
  }));
});

export function getBlush(id: string): BlushProduct | undefined {
  return blushCatalog.find((b) => b.id === id);
}
