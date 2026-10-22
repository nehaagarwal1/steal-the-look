"use client";
// Browser-only: finds the lips with MediaPipe Face Landmarker and measures their color.
// Model and WASM files are served from /public/mediapipe (see scripts/setup-mediapipe.mjs).

import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { blushTint, measureLipColor, regionLab, type BlushTint, type LipMeasurement } from "./measure";
import { hexToRgb, labToHex, rgbToLab, type Lab } from "@/lib/color";

// MediaPipe face mesh indices, ordered around each contour (corner 61/78 -> lower lip -> corner 291/308 -> upper lip).
const OUTER_LIP = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const INNER_LIP = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];

/** Shrink the outer contour toward its center so skin at the lip edge isn't sampled. */
const EDGE_SHRINK = 0.9;
/** Downscale large photos; plenty of lip pixels remain and it keeps sampling fast. */
const MAX_SIDE = 1280;

let landmarker: Promise<FaceLandmarker> | null = null;

/**
 * MediaPipe's WASM runtime prints harmless status lines such as
 * "INFO: Created TensorFlow Lite XNNPACK delegate for CPU." via console.error,
 * which the Next.js dev overlay shows as an error. Drop only those INFO lines.
 */
let consoleFiltered = false;
function filterMediaPipeInfoLogs() {
  if (consoleFiltered || typeof console === "undefined") return;
  consoleFiltered = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && /^INFO: (Created TensorFlow Lite|Initialized TensorFlow Lite)/.test(args[0])) return;
    original(...args);
  };
}

function getLandmarker(): Promise<FaceLandmarker> {
  filterMediaPipeInfoLogs();
  landmarker ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task" },
      runningMode: "IMAGE",
      numFaces: 3, // detect extras so we can warn about group photos
    });
  })().catch((err) => {
    landmarker = null; // let the next call retry instead of failing forever
    throw err;
  });
  return landmarker;
}

export type LipResult = LipMeasurement & {
  /** Canvas with the photo and the sampled lip area outlined, for visual checking. */
  overlay: HTMLCanvasElement;
  faceFound: boolean;
  /** Number of faces detected; only the first is measured. */
  faceCount: number;
  /** Close-up of the lips (data URL) for side-by-side comparison, if a face was found. */
  lipCrop?: string;
};

type Pt = { x: number; y: number };

function contour(lms: NormalizedLandmark[], idx: number[], w: number, h: number): Pt[] {
  return idx.map((i) => ({ x: lms[i].x * w, y: lms[i].y * h }));
}

function shrink(pts: Pt[], factor: number): Pt[] {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return pts.map((p) => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor }));
}

function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
}

export async function measureLipsInImage(img: HTMLImageElement | ImageBitmap): Promise<LipResult> {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);

  const photo = document.createElement("canvas");
  photo.width = w;
  photo.height = h;
  const pctx = photo.getContext("2d", { willReadFrequently: true })!;
  pctx.drawImage(img, 0, 0, w, h);

  const result = (await getLandmarker()).detect(photo);
  const lms = result.faceLandmarks[0];

  const overlay = document.createElement("canvas");
  overlay.width = w;
  overlay.height = h;
  const octx = overlay.getContext("2d")!;
  octx.drawImage(photo, 0, 0);

  if (!lms) {
    const m = measureLipColor({ data: new Uint8ClampedArray(0), width: 0, height: 0 }, new Uint8Array(0));
    return { ...m, reasons: ["no face found in the photo"], overlay, faceFound: false, faceCount: 0 };
  }

  const outer = shrink(contour(lms, OUTER_LIP, w, h), EDGE_SHRINK);
  const inner = contour(lms, INNER_LIP, w, h);

  // Rasterize the lip ring (outer minus inner = excludes teeth and mouth opening).
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = w;
  maskCanvas.height = h;
  const mctx = maskCanvas.getContext("2d", { willReadFrequently: true })!;
  mctx.beginPath();
  tracePath(mctx, outer);
  tracePath(mctx, inner);
  mctx.fillStyle = "#fff";
  mctx.fill("evenodd");
  const maskPixels = mctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = maskPixels[i * 4 + 3] > 127 ? 1 : 0;

  const measurement = measureLipColor(pctx.getImageData(0, 0, w, h), mask);

  // Outline what was sampled so a person can sanity-check it.
  octx.lineWidth = Math.max(2, w / 300);
  octx.strokeStyle = "#00E5FF";
  octx.beginPath();
  tracePath(octx, outer);
  tracePath(octx, inner);
  octx.stroke();

  // Close-up crop around the lips with some margin.
  const all = contour(lms, OUTER_LIP, w, h);
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const pad = (Math.max(...xs) - Math.min(...xs)) * 0.25;
  const cx0 = Math.max(0, Math.min(...xs) - pad), cy0 = Math.max(0, Math.min(...ys) - pad);
  const cw = Math.min(w, Math.max(...xs) + pad) - cx0, ch = Math.min(h, Math.max(...ys) + pad) - cy0;
  const crop = document.createElement("canvas");
  crop.width = Math.round(cw);
  crop.height = Math.round(ch);
  crop.getContext("2d")!.drawImage(photo, cx0, cy0, cw, ch, 0, 0, crop.width, crop.height);
  const lipCrop = crop.toDataURL("image/jpeg", 0.9);

  const faceCount = result.faceLandmarks.length;
  if (faceCount > 1) {
    measurement.reasons.push(`${faceCount} faces found: use a photo with only one person (others haven't consented, and try-on may pick the wrong face)`);
    measurement.confidence = "low";
  }
  return { ...measurement, overlay, faceFound: true, faceCount, lipCrop };
}

/**
 * Lips-only preview: the shopper's original photo with only the lip area
 * taken from the Makeup Transfer result. Skin, brows and eyes stay untouched,
 * so the preview shows exactly what we sell (lipstick) and nothing else.
 */
export async function lipsOnlyComposite(
  original: HTMLImageElement | ImageBitmap,
  transferred: HTMLImageElement | ImageBitmap,
): Promise<HTMLCanvasElement> {
  return regionComposite(original, transferred, (lms, w, h) => [contour(lms, OUTER_LIP, w, h), contour(lms, INNER_LIP, w, h)], "evenodd", Math.max(1, Math.round(transferred.width / 400)));
}

const LEFT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const RIGHT_BROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];

/** The original photo with only the brows taken from a brow try-on. */
export async function browsOnlyComposite(
  original: HTMLImageElement | ImageBitmap,
  tryOn: HTMLImageElement | ImageBitmap,
): Promise<HTMLCanvasElement> {
  return regionComposite(original, tryOn, (lms, w, h) => [contour(lms, LEFT_BROW, w, h), contour(lms, RIGHT_BROW, w, h)], "nonzero", Math.max(2, Math.round(tryOn.width / 150)));
}

/** The original photo with only the cheeks taken from a blush try-on (YouCam also smooths/brightens the rest of the face). */
export async function cheeksOnlyComposite(
  original: HTMLImageElement | ImageBitmap,
  tryOn: HTMLImageElement | ImageBitmap,
): Promise<HTMLCanvasElement> {
  // Each cheek is filled separately (nonzero), with a wide feather like real blush.
  return regionComposite(original, tryOn, (lms, w, h) => [contour(lms, LEFT_CHEEK, w, h), contour(lms, RIGHT_CHEEK, w, h)], "nonzero", Math.max(4, Math.round(tryOn.width / 60)));
}

async function regionComposite(
  original: HTMLImageElement | ImageBitmap,
  transferred: HTMLImageElement | ImageBitmap,
  region: (lms: NormalizedLandmark[], w: number, h: number) => Pt[][],
  fillRule: CanvasFillRule,
  blurPx: number,
): Promise<HTMLCanvasElement> {
  // Work at the transfer result's size; the original is scaled to match
  // (both come from the same photo, so aspect ratios agree).
  const w = transferred.width, h = transferred.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(original, 0, 0, w, h);

  const lms = (await getLandmarker()).detect(transferred as ImageBitmap).faceLandmarks[0];
  if (!lms) throw new Error("No face found in the transfer result");

  // Soft-edged mask so the blend has no hard seam.
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext("2d")!;
  mctx.filter = `blur(${blurPx}px)`;
  mctx.beginPath();
  for (const poly of region(lms, w, h)) tracePath(mctx, poly);
  mctx.fillStyle = "#fff";
  mctx.fill(fillRule);

  // Transferred pixels, kept only where the mask is.
  const part = document.createElement("canvas");
  part.width = w;
  part.height = h;
  const pctx = part.getContext("2d")!;
  pctx.drawImage(transferred, 0, 0, w, h);
  pctx.globalCompositeOperation = "destination-in";
  pctx.drawImage(mask, 0, 0);

  ctx.drawImage(part, 0, 0);
  return out;
}

/** Decodes a File, Blob or data URL into an ImageBitmap (EXIF rotation applied). */
export async function toBitmap(src: Blob | string): Promise<ImageBitmap> {
  const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

// --- Cheeks (blush) -------------------------------------------------------------
// Cheek areas from the cheekbone just under the eye down to the apple of the cheek
// (where YouCam's standard blush placement puts color), plus a forehead patch.
// Left/right use mirrored face-mesh landmarks. Widened 2026-10-20 after real blush
// try-ons showed the color sits higher than the first, lower sampling area.
const LEFT_CHEEK = [116, 111, 117, 118, 119, 100, 142, 36, 205, 187, 123];
const RIGHT_CHEEK = [345, 340, 346, 347, 348, 329, 371, 266, 425, 411, 352];
const FOREHEAD = [107, 66, 105, 104, 69, 108, 151, 337, 299, 333, 334, 296, 336, 9];

export type CheekResult = {
  faceFound: boolean;
  cheek?: Lab;
  forehead?: Lab;
  /** Cheek color minus forehead color: the color blush adds (redness = da). */
  tint?: BlushTint;
  overlay: HTMLCanvasElement;
  reasons: string[];
  /** Close-up band across both cheeks (data URL), for side-by-side comparison. */
  cheekCrop?: string;
};

function polygonMask(w: number, h: number, polys: Pt[][]): Uint8Array {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  for (const poly of polys) {
    ctx.beginPath();
    tracePath(ctx, poly);
    ctx.fill();
  }
  const d = ctx.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return m;
}

/** Measures the blush tint: cheeks compared with the forehead in the same photo. */
export async function measureCheeksInImage(img: HTMLImageElement | ImageBitmap): Promise<CheekResult> {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const photo = document.createElement("canvas");
  photo.width = w;
  photo.height = h;
  const pctx = photo.getContext("2d", { willReadFrequently: true })!;
  pctx.drawImage(img, 0, 0, w, h);
  const overlay = document.createElement("canvas");
  overlay.width = w;
  overlay.height = h;
  const octx = overlay.getContext("2d")!;
  octx.drawImage(photo, 0, 0);

  const lms = (await getLandmarker()).detect(photo).faceLandmarks[0];
  if (!lms) return { faceFound: false, overlay, reasons: ["no face found"] };

  const left = contour(lms, LEFT_CHEEK, w, h), right = contour(lms, RIGHT_CHEEK, w, h), fore = contour(lms, FOREHEAD, w, h);
  const pixels = pctx.getImageData(0, 0, w, h);
  const cheek = regionLab(pixels, polygonMask(w, h, [left, right]));
  const forehead = regionLab(pixels, polygonMask(w, h, [fore]));

  octx.lineWidth = Math.max(2, w / 300);
  for (const [poly, color] of [[left, "#FF6EC7"], [right, "#FF6EC7"], [fore, "#FFD54F"]] as const) {
    octx.strokeStyle = color;
    octx.beginPath();
    tracePath(octx, poly);
    octx.stroke();
  }

  // Band across both cheeks (and the nose between them) for the result cards.
  const pts = [...left, ...right];
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const padX = (Math.max(...xs) - Math.min(...xs)) * 0.08, padY = (Math.max(...ys) - Math.min(...ys)) * 0.25;
  const x0 = Math.max(0, Math.min(...xs) - padX), y0 = Math.max(0, Math.min(...ys) - padY);
  const cw = Math.min(w, Math.max(...xs) + padX) - x0, ch = Math.min(h, Math.max(...ys) + padY) - y0;
  const crop = document.createElement("canvas");
  crop.width = Math.round(cw);
  crop.height = Math.round(ch);
  crop.getContext("2d")!.drawImage(photo, x0, y0, cw, ch, 0, 0, crop.width, crop.height);

  const reasons: string[] = [];
  if (!cheek) reasons.push("cheeks too small in the photo");
  if (!forehead) reasons.push("forehead hidden or too small (hair or a fringe?)");
  return {
    faceFound: true,
    cheek: cheek?.lab,
    forehead: forehead?.lab,
    tint: cheek && forehead ? blushTint(cheek.lab, forehead.lab) : undefined,
    overlay,
    reasons,
    cheekCrop: crop.toDataURL("image/jpeg", 0.9),
  };
}

/**
 * "The look's blush on your bare skin": adds only the measured blush tint change
 * (look tint - bare tint) to the bare selfie's cheeks, with a soft edge. The
 * transfer's foundation/skin-tone change is left out, so the picture is directly
 * comparable with blush try-ons on the same bare selfie. Returns the cheek band crop.
 */
export async function blushOnBareCheeks(bare: ImageBitmap, delta: BlushTint): Promise<{ crop: string; full: string }> {
  const scale = Math.min(1, MAX_SIDE / Math.max(bare.width, bare.height));
  const w = Math.round(bare.width * scale), h = Math.round(bare.height * scale);
  const photo = document.createElement("canvas");
  photo.width = w;
  photo.height = h;
  const pctx = photo.getContext("2d", { willReadFrequently: true })!;
  pctx.drawImage(bare, 0, 0, w, h);
  const lms = (await getLandmarker()).detect(photo).faceLandmarks[0];
  if (!lms) throw new Error("No face found in the selfie");
  const left = contour(lms, LEFT_CHEEK, w, h), right = contour(lms, RIGHT_CHEEK, w, h);

  // Soft cheek mask (feathered so the added color fades out like real blush).
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext("2d", { willReadFrequently: true })!;
  mctx.filter = `blur(${Math.max(4, Math.round(w / 60))}px)`;
  mctx.fillStyle = "#fff";
  for (const poly of [left, right]) { mctx.beginPath(); tracePath(mctx, poly); mctx.fill(); }

  // Band across both cheeks.
  const pts = [...left, ...right];
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const padX = (Math.max(...xs) - Math.min(...xs)) * 0.08, padY = (Math.max(...ys) - Math.min(...ys)) * 0.25;
  const x0 = Math.round(Math.max(0, Math.min(...xs) - padX)), y0 = Math.round(Math.max(0, Math.min(...ys) - padY));
  const cw = Math.round(Math.min(w, Math.max(...xs) + padX) - x0), ch = Math.round(Math.min(h, Math.max(...ys) + padY) - y0);

  // Add the tint inside the soft mask (only the cheek band can contain mask pixels).
  const img = pctx.getImageData(x0, y0, cw, ch);
  const m = mctx.getImageData(x0, y0, cw, ch).data;
  for (let i = 0; i < cw * ch; i++) {
    const k = m[i * 4 + 3] / 255;
    if (k < 0.02) continue;
    const o = i * 4;
    const lab = rgbToLab(img.data[o], img.data[o + 1], img.data[o + 2]);
    const [r, g, b] = hexToRgb(labToHex({ L: lab.L + k * delta.dL, a: lab.a + k * delta.da, b: lab.b + k * delta.db }));
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b;
  }
  pctx.putImageData(img, x0, y0);
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d")!.putImageData(img, 0, 0);
  return { crop: out.toDataURL("image/jpeg", 0.9), full: photo.toDataURL("image/jpeg", 0.9) };
}

/** Pixels of an image, drawn at the given size (default: its own). */
export async function pixelsOf(src: string, w?: number, h?: number): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bmp = await toBitmap(src);
  const c = document.createElement("canvas");
  c.width = w ?? bmp.width;
  c.height = h ?? bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/** Close-up of both brows (for comparing brow colors side by side). */
export async function browCrop(src: string): Promise<string | undefined> {
  const bmp = await toBitmap(src);
  const lms = (await getLandmarker()).detect(bmp).faceLandmarks[0];
  if (!lms) return undefined;
  const pts = [...contour(lms, LEFT_BROW, bmp.width, bmp.height), ...contour(lms, RIGHT_BROW, bmp.width, bmp.height)];
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const w0 = Math.max(...xs) - Math.min(...xs), h0 = Math.max(...ys) - Math.min(...ys);
  const x = Math.max(0, Math.min(...xs) - w0 * 0.08), y = Math.max(0, Math.min(...ys) - h0 * 1.2);
  const w = Math.min(bmp.width - x, w0 * 1.16), h = Math.min(bmp.height - y, h0 * 3.4);
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  c.getContext("2d")!.drawImage(bmp, x, y, w, h, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.9);
}

/**
 * Adds only the change a try-on made (try-on minus a reference try-on from the same YouCam pipeline)
 * inside the cheeks or brows, onto `current`. YouCam brightens/smooths the whole face in every
 * makeup try-on, so copying pixels would also paste brighter skin (and the old background at the
 * face edge); the difference between two try-ons is just the product.
 */
export async function deltaComposite(
  current: ImageBitmap,
  reference: ImageBitmap,
  tryOn: ImageBitmap,
  region: "cheeks" | "brows",
): Promise<HTMLCanvasElement> {
  const w = current.width, h = current.height;
  const layer = (img: ImageBitmap) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    return { c, data: ctx.getImageData(0, 0, w, h) };
  };
  const cur = layer(current), ref = layer(reference), tr = layer(tryOn);
  const lms = (await getLandmarker()).detect(tr.c).faceLandmarks[0];
  if (!lms) throw new Error("No face found in the try-on");

  // Generous soft mask: unchanged pixels add nothing, so it can safely reach the brow tails / cheek edges.
  const mask = document.createElement("canvas");
  mask.width = w; mask.height = h;
  const mctx = mask.getContext("2d", { willReadFrequently: true })!;
  mctx.filter = `blur(${Math.max(3, Math.round(w / (region === "brows" ? 120 : 60)))}px)`;
  mctx.fillStyle = mctx.strokeStyle = "#fff";
  mctx.lineJoin = "round";
  mctx.lineWidth = region === "brows" ? Math.max(4, w / 40) : Math.max(4, w / 30);
  for (const idx of region === "brows" ? [LEFT_BROW, RIGHT_BROW] : [LEFT_CHEEK, RIGHT_CHEEK]) {
    mctx.beginPath();
    tracePath(mctx, contour(lms, idx, w, h));
    mctx.fill();
    mctx.stroke();
  }
  const m = mctx.getImageData(0, 0, w, h).data;
  const out = cur.data;
  for (let i = 0; i < w * h; i++) {
    const k = m[i * 4 + 3] / 255;
    if (k < 0.02) continue;
    const o = i * 4;
    for (let ch = 0; ch < 3; ch++) out.data[o + ch] = Math.max(0, Math.min(255, out.data[o + ch] + k * (tr.data.data[o + ch] - ref.data.data[o + ch])));
  }
  cur.c.getContext("2d")!.putImageData(out, 0, 0);
  return cur.c;
}
