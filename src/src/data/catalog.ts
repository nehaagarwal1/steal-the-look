// Fictional brand ("Lumen") so the demo video has no third-party trademarks.
// Every product carries its true hex color: the color engine works from this,
// not from what the LLM thinks it sees.

import { colorName, deltaE2000, hexToLab, labToHex } from "@/lib/color";

export type LipTexture = "matte" | "gloss" | "satin" | "sheer" | "shimmer" | "metallic" | "holographic";

export type LipProduct = {
  id: string;
  kind: "lipstick";
  name: string;
  shade: string;
  hex: string;
  texture: LipTexture;
  price: number;
  /** Other names for the shade (for search). */
  aliases: string[];
  /** Shade family shared by the same color across price tiers. */
  family?: string;
};


export type Product = LipProduct;

export const catalog: Product[] = [

];

// --- Lipstick dupe catalog (all brands fictional) ---------------------------
// Each shade family exists at three price tiers. The cheaper versions are
// shifted slightly in Lab space: small shifts are true dupes, larger ones are
// "marketed as a dupe" but measurably different, so the app can be honest.

/** Each tier has a range of prices; a shade's price within the range is fixed per family. */
type Tier = { brand: string; line: string; prices: number[]; idPrefix: string };
const LUXE: Tier = { brand: "Maison Aurelle", line: "Rouge Couture", prices: [34, 38, 42, 44, 48, 52, 58], idPrefix: "aur" };
const MID: Tier = { brand: "Lumen", line: "Velvet Lip", prices: [14, 15, 16, 18, 20, 22, 24], idPrefix: "lum" };
const BASIC: Tier = { brand: "Daily Basics", line: "Color Stick", prices: [4, 5, 6, 7, 8, 9, 10, 12], idPrefix: "db" };

type Family = {
  key: string;
  shade: string;
  hex: string;
  texture: LipTexture;
  aliases: string[];
  /** Lab offsets [dL, da, db] applied to the luxe color for the mid and basic tiers. */
  mid: [number, number, number];
  basic: [number, number, number];
};

const FAMILIES: Family[] = [
  { key: "bare-rose", shade: "Bare Rose", hex: "#C25E63", texture: "satin", aliases: ["my lips but better", "rosy nude"], mid: [1, -1, 0.5], basic: [-1.5, 1.5, 1] },
  { key: "nude-beige", shade: "Nude Beige", hex: "#B9806E", texture: "matte", aliases: ["beige", "nude"], mid: [0.5, 1, -0.5], basic: [2, -1, 1.5] },
  { key: "mauve", shade: "Mauve Muse", hex: "#9E5A6B", texture: "satin", aliases: ["mauve"], mid: [-1, 0.5, 1], basic: [6, 7, 5] },
  { key: "dusty-rose", shade: "Dusty Rose", hex: "#B5656F", texture: "matte", aliases: ["dusty rose"], mid: [1.5, 0, -1], basic: [-1, 2, -1] },
  { key: "peony", shade: "Peony", hex: "#D9607E", texture: "gloss", aliases: ["pink"], mid: [-0.5, 1.5, 0.5], basic: [1, -2, 1.5] },
  { key: "coral", shade: "Coral Crush", hex: "#E06A55", texture: "satin", aliases: ["coral"], mid: [1, -1, 1], basic: [-4, 6, -8] },
  { key: "brick", shade: "Brick Lane", hex: "#9C3B2E", texture: "matte", aliases: ["brick", "terracotta"], mid: [0.5, 1, 0], basic: [1, -1.5, 1] },
  { key: "classic-red", shade: "Classic Red", hex: "#B5121F", texture: "matte", aliases: ["red"], mid: [-0.5, -1, 1], basic: [1.5, 2, -1] },
  { key: "blue-red", shade: "Cherry Noir", hex: "#9E0F2E", texture: "satin", aliases: ["blue red", "cherry"], mid: [1, 0.5, -1], basic: [7, -9, 10] },
  { key: "berry", shade: "Wild Berry", hex: "#7B2D4F", texture: "matte", aliases: ["berry"], mid: [-1, 1, 0.5], basic: [1, -1, -1.5] },
  { key: "plum", shade: "Plum Velvet", hex: "#5E2440", texture: "matte", aliases: ["plum"], mid: [0.5, -0.5, 1], basic: [-1, 1.5, 0.5] },
  { key: "peach", shade: "Peach Fizz", hex: "#E39A7D", texture: "sheer", aliases: ["peach"], mid: [-1, 0.5, -1], basic: [2, 1, -2] },
];

function shift(hex: string, [dL, da, db]: [number, number, number]): string {
  const { L, a, b } = hexToLab(hex);
  return labToHex({ L: L + dL, a: a + da, b: b + db });
}

// --- Shade grid: evenly spaced across lipstick colors (not tuned to any test photo) ---
// LCh grid: hue every 12 deg from berry/purple (324) through reds and corals to nude-orange (60),
// 6 depth levels and 4 intensity levels. Colors the sRGB screen can't show accurately are skipped.
const GRID_HUES = [324, 336, 348, 0, 12, 24, 36, 48, 60];
const GRID_L = [30, 38, 46, 54, 62, 70];
const GRID_C = [16, 28, 40, 52];
const GRID_TEXTURES: LipTexture[] = ["matte", "satin", "gloss", "sheer"];

/** Deterministic pseudo-random in [0, 1) from a string, so the catalog never changes between runs. */
function seeded(key: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** Random Lab offset of roughly `size` length, deterministic per key. */
function offset(key: string, size: number, salt: number): [number, number, number] {
  const theta = seeded(key, salt) * Math.PI * 2, phi = (seeded(key, salt + 1) - 0.5) * Math.PI;
  return [size * Math.sin(phi), size * Math.cos(phi) * Math.cos(theta), size * Math.cos(phi) * Math.sin(theta)];
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

const GRID_FAMILIES: Family[] = [];
for (const h of GRID_HUES) for (const L of GRID_L) for (const C of GRID_C) {
  const rad = (h * Math.PI) / 180;
  const lab = { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
  const hex = labToHex(lab);
  if (deltaE2000(labToHex(hexToLab(hex)), hex) > 0.5 || deltaE2000(hex, labToHex(lab)) > 0.5) continue;
  const back = hexToLab(hex);
  if (Math.hypot(back.L - lab.L, back.a - lab.a, back.b - lab.b) > 2) continue; // out of sRGB gamut
  const key = `g${h}-${L}-${C}`;
  const fake = seeded(key, 7) < 0.2; // ~1 in 5 cheap versions is "marketed as a dupe" but differs
  GRID_FAMILIES.push({
    key,
    shade: `${titleCase(colorName(hex))} No. ${101 + GRID_FAMILIES.length}`,
    hex,
    texture: GRID_TEXTURES[Math.floor(seeded(key, 3) * GRID_TEXTURES.length)],
    aliases: [],
    mid: offset(key, 0.8 + seeded(key, 5) * 1.2, 11),
    basic: offset(key, fake ? 8 + seeded(key, 9) * 3 : 1.5 + seeded(key, 9) * 1.5, 13),
  });
}

const dupeCatalog: LipProduct[] = [...FAMILIES, ...GRID_FAMILIES].flatMap((f) =>
  ([[LUXE, f.hex], [MID, shift(f.hex, f.mid)], [BASIC, shift(f.hex, f.basic)]] as const).map(([tier, hex]) => ({
    id: `${tier.idPrefix}-${f.key}`,
    kind: "lipstick" as const,
    name: `${tier.brand} ${tier.line}`,
    shade: f.shade,
    hex,
    texture: f.texture,
    price: tier.prices[Math.floor(seeded(`${tier.idPrefix}:${f.key}`, 17) * tier.prices.length)],
    aliases: f.aliases,
    family: f.key,
  })),
);

catalog.push(...dupeCatalog);

export function getProduct(id: string): Product | undefined {
  return catalog.find((p) => p.id === id);
}
