// Server-side pipeline for "Steal the Look, for Less" (lipstick only).
//
// The server only talks to YouCam. Measuring lips and ranking shades happen in
// the browser (MediaPipe), so results are returned as data URLs the browser
// can read pixels from (YouCam's signed result URLs aren't CORS-readable).
//
// DEMO_MODE=1   replays a recorded session from public/demo/look/ (0 units).
// RECORD_DEMO=1 saves a real session there while you use the app.

import "server-only";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cached, HOUR } from "./cache";
import { generateImage, prepareImage, TRANSFER_MAX_SIDE, transferMakeup, tryOnLipstick, uploadImage, YouCamError } from "./youcam";
import { facePrompt, NEGATIVE_PROMPT } from "./synthetic-faces";
import { getProduct, type LipProduct } from "@/data/catalog";

export const MAX_TRYONS_PER_REQUEST = 6;
const DEMO_DIR = path.join(process.cwd(), "public", "demo", "look");
const MANIFEST = path.join(DEMO_DIR, "manifest.json");

export type DemoManifest = {
  recordedAt: string;
  /** Public paths, e.g. "/demo/look/selfie.jpg". */
  selfie: string;
  look: string;
  transfer: string;
  tryons: Record<string, string>;
};

export const isDemoMode = () => process.env.DEMO_MODE === "1";
const isRecording = () => process.env.RECORD_DEMO === "1" && !isDemoMode();

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex").slice(0, 16);
const toDataUrl = (b: Buffer) => `data:image/jpeg;base64,${b.toString("base64")}`;

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new YouCamError(`Downloading the result failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// --- Demo manifest -----------------------------------------------------------

export function readDemoManifest(): DemoManifest | null {
  return existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as DemoManifest) : null;
}

function writeDemoFile(name: string, bytes: Buffer, update: (m: DemoManifest) => void) {
  mkdirSync(DEMO_DIR, { recursive: true });
  writeFileSync(path.join(DEMO_DIR, name), bytes);
  const m: DemoManifest = readDemoManifest() ?? { recordedAt: "", selfie: "", look: "", transfer: "", tryons: {} };
  update(m);
  m.recordedAt = new Date().toISOString();
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

function readPublic(publicPath: string): Buffer {
  return readFileSync(path.join(process.cwd(), "public", publicPath));
}

// --- Pipeline ----------------------------------------------------------------

export type StartResult = {
  /** YouCam file id of the normalized selfie; reused for every try-on (valid ~24h). */
  fileId: string;
  /** The selfie exactly as YouCam received it (same size as the transfer result). */
  selfieImage: string;
  /** Full Makeup Transfer result. */
  transferImage: string;
  /** In demo mode, the recorded look photo (the browser measures it). */
  lookImage?: string;
};

export async function startSession(selfie: Buffer, look: Buffer): Promise<StartResult> {
  if (isDemoMode()) {
    const m = readDemoManifest();
    if (!m?.transfer) throw new Error("No recorded demo session. Record one with RECORD_DEMO=1 (see README).");
    return {
      fileId: "demo",
      selfieImage: toDataUrl(readPublic(m.selfie)),
      transferImage: toDataUrl(readPublic(m.transfer)),
      lookImage: toDataUrl(readPublic(m.look)),
    };
  }

  // Normalize once, so the transfer and every try-on start from the identical image.
  const selfieJpeg = await prepareImage(selfie, TRANSFER_MAX_SIDE);
  const lookJpeg = await prepareImage(look, TRANSFER_MAX_SIDE);
  const key = `${sha(selfieJpeg)}:${sha(lookJpeg)}`;

  const log = (msg: string) => console.info(`[look] ${msg}`);
  log(`start: selfie ${selfieJpeg.byteLength} B, look ${lookJpeg.byteLength} B`);
  const result = await cached(`look:${key}`, 20 * HOUR, async () => {
    log("uploading photos to YouCam…");
    const fileId = await uploadImage(selfieJpeg, "selfie.jpg", TRANSFER_MAX_SIDE, { prepared: true });
    const refId = await uploadImage(lookJpeg, "look.jpg", TRANSFER_MAX_SIDE, { prepared: true });
    log("running Makeup Transfer (2 units)…");
    const { url } = await transferMakeup(fileId, refId);
    log("transfer done, downloading result");
    return { fileId, transfer: await download(url) };
  });

  if (isRecording()) {
    log("recording demo session to public/demo/look/");
    writeDemoFile("selfie.jpg", selfieJpeg, (m) => (m.selfie = "/demo/look/selfie.jpg"));
    writeDemoFile("look.jpg", lookJpeg, (m) => (m.look = "/demo/look/look.jpg"));
    writeDemoFile("transfer.jpg", result.transfer, (m) => { m.transfer = "/demo/look/transfer.jpg"; m.tryons = {}; });
  }

  return { fileId: result.fileId, selfieImage: toDataUrl(selfieJpeg), transferImage: toDataUrl(result.transfer) };
}

export type TryOnOutcome = { productId: string; image?: string; error?: string };

/**
 * One try-on: applies a shade (color + finish) to the uploaded selfie and returns the image.
 * Cached per selfie + color + finish; retried once on a transient failure.
 */
async function renderShade(fileId: string, shade: Pick<LipProduct, "hex" | "texture">): Promise<Buffer> {
  const label = `${shade.hex}/${shade.texture}`;
  const attempt = async () => download((await tryOnLipstick(fileId, shade)).url);
  return cached(`tryon:${fileId}:${shade.hex}:${shade.texture}`, 1.5 * HOUR, async () => {
    try {
      return await attempt();
    } catch (first) {
      if (first instanceof YouCamError && first.code?.startsWith("error_")) throw first; // photo problem: retry won't help
      console.warn(`[look] try-on ${label} failed, retrying once: ${(first as Error).message}`);
      await new Promise((r) => setTimeout(r, 1500));
      return attempt();
    }
  });
}

export async function tryOnProducts(fileId: string, productIds: string[]): Promise<TryOnOutcome[]> {
  const products = productIds
    .slice(0, MAX_TRYONS_PER_REQUEST)
    .map((id) => getProduct(id))
    .filter((p): p is LipProduct => p?.kind === "lipstick");

  if (isDemoMode()) {
    const m = readDemoManifest();
    return products.map((p) => {
      const file = m?.tryons[p.id];
      return file
        ? { productId: p.id, image: toDataUrl(readPublic(file)) }
        : { productId: p.id, error: "Not in the recorded demo session." };
    });
  }

  console.info(`[look] try-on: ${products.map((p) => p.id).join(", ")}`);
  // A few at a time keeps us well under YouCam's rate limit.
  const out: TryOnOutcome[] = [];
  // Two at a time: running three in parallel made YouCam drop tasks.
  for (let i = 0; i < products.length; i += 2) {
    const batch = products.slice(i, i + 2);
    out.push(...(await Promise.all(batch.map(async (p): Promise<TryOnOutcome> => {
      try {
        const bytes = await renderShade(fileId, p);
        if (isRecording()) writeDemoFile(`tryon-${p.id}.jpg`, bytes, (m) => (m.tryons[p.id] = `/demo/look/tryon-${p.id}.jpg`));
        return { productId: p.id, image: toDataUrl(bytes) };
      } catch (err) {
        console.error(`[look] try-on ${p.id} failed: ${(err as Error).message}`);
        return { productId: p.id, error: (err as Error).message };
      }
    }))));
  }
  return out;
}

// --- Retailer Dupe Audit -------------------------------------------------------

export type AuditShadeInput = { key: string; hex: string; texture: LipProduct["texture"] };

/** Uploads one consented test face; returns its YouCam file id and the normalized image. */
export async function uploadAuditFace(selfie: Buffer): Promise<{ fileId: string; image: string }> {
  const jpeg = await prepareImage(selfie, TRANSFER_MAX_SIDE);
  const fileId = await cached(`auditface:${sha(jpeg)}`, 20 * HOUR, () => uploadImage(jpeg, "face.jpg", TRANSFER_MAX_SIDE, { prepared: true }));
  return { fileId, image: toDataUrl(jpeg) };
}

/** Tries arbitrary shades (e.g. from a retailer's CSV) on one face, two at a time. */
export async function tryOnAuditShades(fileId: string, shades: AuditShadeInput[]): Promise<{ key: string; image?: string; error?: string }[]> {
  console.info(`[audit] face ${fileId.slice(0, 8)}…: ${shades.length} shades`);
  const out: { key: string; image?: string; error?: string }[] = [];
  for (let i = 0; i < shades.length; i += 2) {
    out.push(...(await Promise.all(shades.slice(i, i + 2).map(async (sh) => {
      try {
        return { key: sh.key, image: toDataUrl(await renderShade(fileId, sh)) };
      } catch (err) {
        console.error(`[audit] ${sh.key} failed: ${(err as Error).message}`);
        return { key: sh.key, error: (err as Error).message };
      }
    }))));
  }
  return out;
}

const AUDIT_REPORT = path.join(process.cwd(), "public", "demo", "audit", "report.json");

/** Saves a finished audit report (numbers and labels only, no photos) for demo mode. */
export function saveAuditReport(json: string) {
  mkdirSync(path.dirname(AUDIT_REPORT), { recursive: true });
  writeFileSync(AUDIT_REPORT, json);
}

export const auditRecordingOn = () => isRecording();

/**
 * Generates one synthetic (AI) test face. 1 unit, except when a face for the
 * same preset was saved before: then that file is reused for free.
 * Outside production, each new face is saved to selfies/ (git-ignored) so it's never lost.
 */
export async function generateSyntheticFace(
  person: string,
  presetId = "custom",
): Promise<{ image: string; prompt: string; savedTo?: string; reused?: boolean }> {
  const prompt = facePrompt(person);
  const dir = path.join(process.cwd(), "selfies");
  const canSave = process.env.NODE_ENV !== "production";

  if (canSave && presetId !== "custom" && existsSync(dir)) {
    const prior = readdirSync(dir).filter((f) => f.startsWith(`synthetic-${presetId}-`) && /\.jpe?g$/i.test(f)).sort().pop();
    if (prior) {
      console.info(`[audit] reusing saved synthetic face selfies/${prior}`);
      return { image: toDataUrl(readFileSync(path.join(dir, prior))), prompt, savedTo: `selfies/${prior}`, reused: true };
    }
  }

  console.info(`[audit] generating synthetic face: ${person.slice(0, 60)}`);
  const { url } = await generateImage(prompt, { negativePrompt: NEGATIVE_PROMPT });
  const jpeg = await prepareImage(await download(url), TRANSFER_MAX_SIDE);
  let savedTo: string | undefined;
  if (canSave) {
    try {
      mkdirSync(dir, { recursive: true });
      const name = `synthetic-${presetId}-${Date.now()}.jpg`;
      writeFileSync(path.join(dir, name), jpeg);
      savedTo = `selfies/${name}`;
    } catch (err) {
      console.warn(`[audit] couldn't save synthetic face: ${(err as Error).message}`);
    }
  }
  return { image: toDataUrl(jpeg), prompt, savedTo };
}
