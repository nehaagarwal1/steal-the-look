// Deterministic color engine. Everything the app says about color is computed
// here from hex values, so the LLM only phrases facts and never guesses them.

export type Lab = { L: number; a: number; b: number };
export type Undertone = "warm" | "cool" | "neutral";

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  // sRGB -> XYZ (D65)
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  return hexToLab(rgbToHex(r, g, b));
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** Inverse of hexToLab (D65). Out-of-gamut values are clamped. */
export function labToHex({ L, a, b }: Lab): string {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const x = inv(fx) * 0.95047, y = inv(fy), z = inv(fz) * 1.08883;
  const lin = [
    x * 3.2404542 - y * 1.5371385 - z * 0.4985314,
    -x * 0.969266 + y * 1.8760108 + z * 0.041556,
    x * 0.0556434 - y * 0.2040259 + z * 1.0572252,
  ];
  const toSrgb = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055);
  const [r, g, bb] = lin.map(toSrgb);
  return rgbToHex(r, g, bb);
}

/** CIEDE2000 color difference. ~1 = barely perceptible, >10 = clearly different. */
export function deltaE2000(hex1: string, hex2: string): number {
  const c1 = hexToLab(hex1), c2 = hexToLab(hex2);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(c1.a, c1.b), C2 = Math.hypot(c2.a, c2.b);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1 = (1 + G) * c1.a, a2 = (1 + G) * c2.a;
  const C1p = Math.hypot(a1, c1.b), C2p = Math.hypot(a2, c2.b);
  const hp = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h >= 0 ? h : h + 360;
  };
  const h1 = hp(c1.b, a1), h2 = hp(c2.b, a2);
  const dL = c2.L - c1.L, dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2);
  const Lm = (c1.L + c2.L) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1 + h2;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1 - h2) > 180) hm += h1 + h2 < 360 ? 360 : -360;
    hm /= 2;
  }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad)
    + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

/** Hue angle in degrees (0-360) in Lab space. */
export function hueAngle(hex: string): number {
  const { a, b } = hexToLab(hex);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return h >= 0 ? h : h + 360;
}

export function chroma(hex: string): number {
  const { a, b } = hexToLab(hex);
  return Math.hypot(a, b);
}

/**
 * Skin undertone heuristic from the Lab hue angle of the skin color.
 * Skin hues cluster roughly 40-70 deg; more yellow (higher angle) reads warm,
 * more pink/red (lower angle) reads cool. Thresholds are a starting point to
 * tune against real YouCam outputs in week 1.
 */
export function skinUndertone(skinHex: string): Undertone {
  const h = hueAngle(skinHex);
  if (h >= 58) return "warm";
  if (h <= 48) return "cool";
  return "neutral";
}

/** Undertone of a product color (lipstick, garment) by hue family. */
export function productTemperature(hex: string): Undertone {
  if (chroma(hex) < 8) return "neutral"; // greys, blacks, whites
  const h = hueAngle(hex);
  // Lab hue: ~0-30 pink/magenta-red, ~30-90 orange/yellow, ~90-200 green, ~200-330 blue/purple
  if (h > 30 && h < 100) return "warm";
  if (h >= 200 || h < 20) return "cool";
  return "neutral";
}

export type LightnessContrast = "much lighter" | "lighter" | "similar depth" | "deeper" | "much deeper";

export function lightnessContrast(productHex: string, referenceHex: string): LightnessContrast {
  const d = hexToLab(productHex).L - hexToLab(referenceHex).L;
  if (d > 20) return "much lighter";
  if (d > 7) return "lighter";
  if (d < -20) return "much deeper";
  if (d < -7) return "deeper";
  return "similar depth";
}

export type ContrastLevel = "subtle" | "noticeable" | "bold";

export function contrastLevel(deltaE: number): ContrastLevel {
  if (deltaE < 10) return "subtle";
  if (deltaE < 25) return "noticeable";
  return "bold";
}

export type Harmony = "matching" | "analogous" | "complementary" | "contrasting" | "neutral pairing";

/** How two colors relate on the hue wheel (e.g. lipstick vs outfit). */
export function harmony(hex1: string, hex2: string): Harmony {
  if (chroma(hex1) < 8 || chroma(hex2) < 8) return "neutral pairing";
  let d = Math.abs(hueAngle(hex1) - hueAngle(hex2));
  if (d > 180) d = 360 - d;
  if (d < 15) return "matching";
  if (d < 45) return "analogous";
  if (d > 150) return "complementary";
  return "contrasting";
}

/** Plain-language color family name for speech, e.g. "warm coral", "deep berry". */
export function colorName(hex: string): string {
  const { L } = hexToLab(hex);
  const c = chroma(hex);
  const h = hueAngle(hex);
  const depth = L < 30 ? "deep " : L > 75 ? "light " : "";
  if (c < 8) return L < 20 ? "black" : L > 90 ? "white" : `${depth}grey`.trim();
  // Lab hue ranges calibrated against reference colors (navy 282, purple 328, hot pink 351, coral 39).
  const families: [number, string][] = [
    [20, "pink"], [37, "red"], [50, "coral"], [80, "orange"], [110, "yellow"],
    [190, "green"], [250, "teal"], [318, "blue"], [340, "purple"], [361, "pink"],
  ];
  let fam = families.find(([max]) => h < max)?.[1] ?? "pink";
  if (fam === "pink" && L < 40) fam = "berry";
  // low-chroma warm hues read as nude/brown rather than orange
  if (c < 25 && h > 35 && h < 100) return `${depth}${L < 45 ? "brown" : "nude"}`;
  return fam === "berry" ? fam : `${depth}${fam}`;
}

/** Skin is described by depth, never by hue family ("orange" skin would be wrong and hurtful). */
export function skinDepthName(hex: string): string {
  const { L } = hexToLab(hex);
  if (L > 80) return "fair";
  if (L > 68) return "light";
  if (L > 55) return "medium";
  if (L > 42) return "tan";
  if (L > 30) return "deep";
  return "rich deep";
}
