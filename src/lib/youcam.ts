// Server-only YouCam API client. Never import this from client components:
// the API key must stay on the server.
//
// Flow (from the YouCam OpenAPI specs):
//   1. POST /s2s/v2.0/file           -> file_id + pre-signed upload request
//   2. PUT bytes to that upload URL  (the API does NOT upload for you)
//   3. POST /s2s/v2.0/task/<feature> -> task_id
//   4. GET  /s2s/v2.0/task/<feature>/<task_id> until task_status is success|error
// Files and results are retained ~24h; result image URLs are valid ~2h.

import "server-only";
import sharp from "sharp";
import type { LipProduct } from "@/data/catalog";
import { assertCanSpend, recordSpend } from "./units";
import { blushPalette, lipPalette, type BlushTexture } from "./lips/palette";

const BASE = process.env.YOUCAM_BASE_URL ?? "https://yce-api-01.makeupar.com";

export class YouCamError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

function apiKey(): string {
  const key = process.env.YOUCAM_API_KEY;
  if (!key) throw new YouCamError("YOUCAM_API_KEY is not set. Set it in .env.local or run with DEMO_MODE=1.");
  return key;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (json as { error_code?: string }).error_code;
    throw new YouCamError(`YouCam ${method} ${path} failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`, code);
  }
  return json as T;
}

type FileResponse = {
  data: {
    files: {
      file_id: string;
      requests: { url: string; method: string; headers: Record<string, string> }[];
    }[];
  };
};

/** YouCam rejects images larger than this on either side. */
const MAX_IMAGE_SIDE = 1920;

/**
 * Normalizes any photo for YouCam: applies EXIF rotation (phone selfies),
 * shrinks to fit 1920x1920, and re-encodes as JPEG.
 */
export async function prepareImage(bytes: Buffer, maxSide = MAX_IMAGE_SIDE): Promise<Buffer> {
  return sharp(bytes)
    .rotate() // honor EXIF orientation, then strip it
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Uploads an image (any size/format sharp can read) and returns a YouCam file_id. */
export async function uploadImage(
  bytes: Buffer,
  fileName: string,
  maxSide = MAX_IMAGE_SIDE,
  { prepared = false }: { prepared?: boolean } = {},
): Promise<string> {
  const jpeg = prepared ? bytes : await prepareImage(bytes, maxSide);
  const res = await call<FileResponse>("POST", "/s2s/v2.0/file", {
    files: [{ content_type: "image/jpeg", file_name: fileName.replace(/\.\w+$/, "") + ".jpg", file_size: jpeg.byteLength }],
  });
  const file = res.data.files[0];
  const req = file.requests[0];
  const put = await fetch(req.url, { method: req.method ?? "PUT", headers: req.headers, body: new Uint8Array(jpeg) });
  if (!put.ok) throw new YouCamError(`Upload to pre-signed URL failed (${put.status})`);
  return file.file_id;
}

type TaskStatus<R> = {
  data: { task_status: "running" | "success" | "error"; error?: string; error_message?: string; results?: R };
};

async function runTask<R>(feature: string, body: Record<string, unknown>, timeoutMs = 60_000, apiVersion = "v2.0"): Promise<R> {
  assertCanSpend(feature);
  const started = await call<{ data: { task_id: string } }>("POST", `/s2s/${apiVersion}/task/${feature}`, body);
  const taskId = started.data.task_id;
  const deadline = Date.now() + timeoutMs;
  let delay = 800;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay));
    const status = await call<TaskStatus<R>>("GET", `/s2s/${apiVersion}/task/${feature}/${taskId}`);
    if (status.data.task_status === "success") {
      recordSpend(feature); // YouCam bills per successful result image
      return status.data.results as R;
    }
    if (status.data.task_status === "error") {
      throw new YouCamError(status.data.error_message ?? status.data.error ?? "Task failed", status.data.error);
    }
    delay = Math.min(delay * 1.5, 3000); // stay well under the 250 req / 5 min rate limit
  }
  throw new YouCamError(`Task ${feature} timed out`);
}

// --- Features --------------------------------------------------------------

/** Applies a lipstick shade. Only its color and finish are sent to YouCam. */
export async function tryOnLipstick(fileId: string, product: Pick<LipProduct, "hex" | "texture">): Promise<{ url: string }> {
  return runTask("makeup-vto", {
    src_file_id: fileId,
    version: "1.0",
    effects: [
      {
        category: "lip_color",
        shape: { name: "original" },
        style: { type: "full" },
        palettes: [lipPalette(product)], // finish-specific required fields live in lipPalette
      },
    ],
  });
}

/**
 * AI Image Generator V2 (text to image), 1 unit. Portrait 3:4 by default.
 * Prompt rewriting is off so the audit requirements in the prompt are kept exactly.
 */
export async function generateImage(
  prompt: string,
  { negativePrompt, size = "1104*1472" }: { negativePrompt?: string; size?: "1664*928" | "1472*1104" | "1328*1328" | "1104*1472" | "928*1664" } = {},
): Promise<{ url: string }> {
  return runTask(
    "text-to-image/youcam",
    { model: "youcam-image-v2", prompt, ...(negativePrompt ? { negative_prompt: negativePrompt } : {}), size, prompt_extend: false },
    120_000,
  );
}

/** Applies blush with the basic one-color placement pattern ("1color1" from YouCam's blush.json). 1 unit. */
export async function tryOnBlush(fileId: string, blush: { hex: string; texture?: BlushTexture; intensity?: number }): Promise<{ url: string }> {
  return runTask("makeup-vto", {
    src_file_id: fileId,
    version: "1.0",
    effects: [{ category: "blush", pattern: { name: "1color1" }, palettes: [blushPalette(blush.hex, blush.texture, blush.intensity)] }],
  });
}

/** Makeup Transfer only accepts images up to 1024px on the long side, one full frontal face. */
export const TRANSFER_MAX_SIDE = 1024;

/** Copies the makeup look from `refFileId` (inspiration photo) onto `srcFileId` (the shopper). 2 units. */
export async function transferMakeup(srcFileId: string, refFileId: string): Promise<{ url: string }> {
  return runTask("mu-transfer", { src_file_id: srcFileId, ref_file_id: refFileId });
}

/**
 * AI Hairstyle Generator v2.1 with a reference photo: copies the hairstyle from `refFileId` onto `srcFileId`. 2 units.
 * Needs a single frontal face (pitch within ±10°), visible shoulders and hair that isn't too short; long side ≤ 1024px.
 * `hairColor`: "ref" also copies the reference's hair color, "src" keeps the shopper's own.
 */
export async function transferHair(srcFileId: string, refFileId: string, hairColor: "ref" | "src" = "ref"): Promise<{ url: string }> {
  return runTask("hair-transfer", { src_file_id: srcFileId, ref_file_id: refFileId, hair_color: hairColor }, 120_000, "v2.1");
}

/** Full strength: at 65 the tint barely showed on dark brows (2026-10-21). */
export const BROW_INTENSITY = 100;

/** Brow color only (keeps the shopper's brow shape), via makeup-vto. 1 unit. */
export async function tryOnBrowColor(fileId: string, hex: string, intensity = BROW_INTENSITY): Promise<{ url: string }> {
  return runTask("makeup-vto", {
    src_file_id: fileId,
    version: "1.0",
    effects: [{ category: "eyebrows", pattern: { type: "color" }, palettes: [{ color: hex, colorIntensity: intensity, texture: "matte" }] }],
  });
}

/** Hair Color try-on (full mode) with a dye color. 1 unit. Long side < 1920px. */
export async function tryOnHairColor(fileId: string, dye: { hex: string; intensity?: number; shine?: number }): Promise<{ url: string }> {
  return runTask("hair-color", {
    src_file_id: fileId,
    pattern: { name: "full" },
    palettes: [{ color: dye.hex, color_intensity: dye.intensity ?? 85, shine_intensity: dye.shine ?? 40 }],
  });
}

/** Account unit balance. Response shape per the YouCam docs: results[] of { id, type, amount, expiry }. Free to call. */
export async function creditBalance(): Promise<unknown> {
  return call("GET", "/s2s/v1.0/client/credit");
}

/** Plain-language fixes for YouCam face-check errors ("src" = shopper photo, "ref" = inspiration photo). */
const FACE_ERROR_HINTS: Record<string, string> = {
  no_face: "no face was found",
  face_too_small: "the face is too small; crop closer to the face",
  large_face_angle: "the face is turned; use a straight-on photo",
  eye_closed: "the eyes are closed",
  eye_occluded: "the eyes are covered (glasses, hair, or hands); retake without glasses",
  lip_occluded: "the lips are covered",
};

/** Hairstyle Generator errors (no src/ref prefix in the codes). */
const HAIR_ERROR_HINTS: Record<string, string> = {
  error_no_shoulder: "Hairstyle: your shoulders need to be visible. Use a photo that shows head and shoulders.",
  error_hair_too_short: "Hairstyle: the hair in the photo is too short (or tied back) to restyle.",
  error_face_pose: "Hairstyle: the head is tilted up or down too much. Hold the camera at eye level.",
  error_large_face_angle: "Hairstyle: the face is turned too far. Use a straight-on photo.",
  error_insufficient_landmarks: "Hairstyle: the face and shoulders couldn't be found clearly.",
};

export function explainYouCamError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const code = (err as YouCamError).code ?? err.message;
  const m = /^error_(src|ref)_(.+)$/.exec(code);
  if (m && FACE_ERROR_HINTS[m[2]]) {
    return `${m[1] === "src" ? "Your selfie" : "The inspiration photo"}: ${FACE_ERROR_HINTS[m[2]]}. (${code})`;
  }
  if (HAIR_ERROR_HINTS[code]) return `${HAIR_ERROR_HINTS[code]} (${code})`;
  if (code.startsWith("error_inappropriate_ref")) return `The inspiration photo: hair is too close to the eyes, or the face isn't frontal enough. (${code})`;
  return err.message;
}

export const isOutOfCredits = (err: unknown) => err instanceof YouCamError && err.code === "CreditInsufficiency";

export type FeatureCost = { description: string; amount: number; unit: string; proc_unit: number; run_task_url: string };

/** Per-feature unit costs for your account, all pages. Free to call. */
export async function featureCosts(): Promise<FeatureCost[]> {
  const all: FeatureCost[] = [];
  let token: string | undefined;
  for (let page = 0; page < 30; page++) { // guard against a token that never ends
    const qs = new URLSearchParams({ page_size: "20", ...(token ? { starting_token: token } : {}) });
    const res = await call<{ result: { skus: FeatureCost[]; next_token?: string } }>(
      "GET", `/s2s/v2.0/credit/feature-cost?${qs}`,
    );
    all.push(...res.result.skus);
    const next = res.result.next_token;
    if (!next || next === token || res.result.skus.length === 0) break;
    token = next;
  }
  return all;
}
