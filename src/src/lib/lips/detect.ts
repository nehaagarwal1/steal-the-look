"use client";
// Browser-only: finds the lips with MediaPipe Face Landmarker and measures their color.
// Model and WASM files are served from /public/mediapipe (see scripts/setup-mediapipe.mjs).

import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { measureLipColor, type LipMeasurement } from "./measure";

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

  // Soft-edged lip mask (outer minus inner contour) so the blend has no hard seam.
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext("2d")!;
  mctx.filter = `blur(${Math.max(1, Math.round(w / 400))}px)`;
  mctx.beginPath();
  tracePath(mctx, contour(lms, OUTER_LIP, w, h));
  tracePath(mctx, contour(lms, INNER_LIP, w, h));
  mctx.fillStyle = "#fff";
  mctx.fill("evenodd");

  // Transferred pixels, kept only where the mask is.
  const lips = document.createElement("canvas");
  lips.width = w;
  lips.height = h;
  const lctx = lips.getContext("2d")!;
  lctx.drawImage(transferred, 0, 0, w, h);
  lctx.globalCompositeOperation = "destination-in";
  lctx.drawImage(mask, 0, 0);

  ctx.drawImage(lips, 0, 0);
  return out;
}

/** Decodes a File, Blob or data URL into an ImageBitmap (EXIF rotation applied). */
export async function toBitmap(src: Blob | string): Promise<ImageBitmap> {
  const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}
