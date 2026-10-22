// Server-side pipeline for "Pretty Smart" (lipstick, blush, hair, brows).
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
import { generateImage, prepareImage, TRANSFER_MAX_SIDE, transferHair, transferMakeup, tryOnBlush, tryOnBrowColor, tryOnHairColor, BROW_INTENSITY, tryOnLipstick, uploadImage, YouCamError } from "./youcam";
import { getBlush, type BlushProduct } from "@/data/blush-catalog";
import { getHairDye, type HairDye } from "@/data/hair-catalog";
import { getBrow, type BrowProduct } from "@/data/brow-catalog";
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
  /** Blush try-ons: product id -> public path. */
  blush?: Record<string, string>;
  /** Hairstyle from the look: "ref" = with the look's hair color, "src" = keeping the shopper's own. */
  hair?: Partial<Record<HairColorMode, string>>;
  /** Hair dye try-ons: base ("ref"/"src" hairstyle, or "none" = own hair) -> dye id -> public path. */
  hairColor?: Partial<Record<HairBase, Record<string, string>>>;
  /** Whether the look photo is AI-generated (from its "synthetic-" filename), so it can be labeled. */
  lookSynthetic?: boolean;
  /** Brow color try-ons on the selfie: product id -> public path. */
  brows?: Record<string, string>;
};

/** What a hair dye is applied to: the look's hairstyle (with its color / your color) or your own hair. */
export type HairBase = HairColorMode | "none";

export type HairColorMode = "ref" | "src";

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
  /** YouCam file id of the look photo; reused for the hairstyle. */
  lookFileId: string;
  /** The selfie exactly as YouCam received it (same size as the transfer result). */
  selfieImage: string;
  /** Full Makeup Transfer result. */
  transferImage: string;
  /** In demo mode, the recorded look photo (the browser measures it). */
  lookImage?: string;
  /** The look photo is AI-generated: shown with an "AI-generated" label. */
  lookSynthetic?: boolean;
};

export async function startSession(selfie: Buffer, look: Buffer, lookSynthetic = false): Promise<StartResult> {
  if (isDemoMode()) {
    const m = readDemoManifest();
    if (!m?.transfer) throw new Error("No recorded demo session. Record one with RECORD_DEMO=1 (see README).");
    return {
      fileId: "demo",
      lookFileId: "demo",
      selfieImage: toDataUrl(readPublic(m.selfie)),
      transferImage: toDataUrl(readPublic(m.transfer)),
      lookImage: toDataUrl(readPublic(m.look)),
      lookSynthetic: !!m.lookSynthetic,
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
    return { fileId, refId, transfer: await download(url) };
  });

  if (isRecording()) {
    log("recording demo session to public/demo/look/");
    writeDemoFile("selfie.jpg", selfieJpeg, (m) => (m.selfie = "/demo/look/selfie.jpg"));
    writeDemoFile("look.jpg", lookJpeg, (m) => { m.look = "/demo/look/look.jpg"; m.lookSynthetic = lookSynthetic; });
    writeDemoFile("transfer.jpg", result.transfer, (m) => { m.transfer = "/demo/look/transfer.jpg"; m.tryons = {}; m.blush = {}; m.hair = {}; m.hairColor = {}; m.brows = {}; });
  }

  return { fileId: result.fileId, lookFileId: result.refId, selfieImage: toDataUrl(selfieJpeg), transferImage: toDataUrl(result.transfer), lookSynthetic };
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

// --- Blush ------------------------------------------------------------------------

export const MAX_BLUSH_PER_REQUEST = 4;

/** Blush try-ons on the selfie (1 unit each, cached; demo mode replays the recording). */
export async function tryOnBlushes(fileId: string, ids: string[]): Promise<TryOnOutcome[]> {
  const products = ids.slice(0, MAX_BLUSH_PER_REQUEST).map(getBlush).filter((b): b is BlushProduct => !!b);

  if (isDemoMode()) {
    const m = readDemoManifest();
    return products.map((p) => {
      const file = m?.blush?.[p.id];
      return file ? { productId: p.id, image: toDataUrl(readPublic(file)) } : { productId: p.id, error: "Not in the recorded demo session." };
    });
  }

  console.info(`[look] blush try-on: ${products.map((p) => p.id).join(", ")}`);
  const out: TryOnOutcome[] = [];
  for (let i = 0; i < products.length; i += 2) {
    out.push(...(await Promise.all(products.slice(i, i + 2).map(async (p): Promise<TryOnOutcome> => {
      try {
        const attempt = async () => download((await tryOnBlush(fileId, { hex: p.hex, texture: p.texture })).url);
        const bytes = await cached(`blush:${fileId}:${p.hex}:${p.texture}`, 1.5 * HOUR, async () => {
          try {
            return await attempt();
          } catch (first) {
            if (first instanceof YouCamError && first.code?.startsWith("error_")) throw first;
            console.warn(`[look] blush ${p.id} failed, retrying once: ${(first as Error).message}`);
            await new Promise((r) => setTimeout(r, 1500));
            return attempt();
          }
        });
        if (isRecording()) writeDemoFile(`blush-${p.id}.jpg`, bytes, (m) => { m.blush = { ...(m.blush ?? {}), [p.id]: `/demo/look/blush-${p.id}.jpg` }; });
        return { productId: p.id, image: toDataUrl(bytes) };
      } catch (err) {
        console.error(`[look] blush ${p.id} failed: ${(err as Error).message}`);
        return { productId: p.id, error: (err as Error).message };
      }
    }))));
  }
  return out;
}

// --- Hair ---------------------------------------------------------------------------

/** The look photo's hairstyle on the selfie (2 units, cached; demo mode replays the recording). */
export async function tryOnHair(fileId: string, lookFileId: string, color: HairColorMode): Promise<string> {
  if (isDemoMode()) {
    const file = readDemoManifest()?.hair?.[color];
    if (!file) throw new Error("No recorded demo session for this hairstyle. Record one with RECORD_DEMO=1.");
    return toDataUrl(readPublic(file));
  }
  return toDataUrl(await hairBytes(fileId, lookFileId, color));
}

async function hairBytes(fileId: string, lookFileId: string, color: HairColorMode): Promise<Buffer> {
  return cached(`hair:${fileId}:${lookFileId}:${color}`, 20 * HOUR, async () => {
    console.info(`[look] hairstyle from the look (hair color: ${color === "ref" ? "the look's" : "yours"}, 2 units)…`);
    const bytes = await download((await transferHair(fileId, lookFileId, color)).url);
    if (isRecording()) writeDemoFile(`hair-${color}.jpg`, bytes, (m) => { m.hair = { ...(m.hair ?? {}), [color]: `/demo/look/hair-${color}.jpg` }; });
    return bytes;
  });
}

export const MAX_HAIR_DYES_PER_REQUEST = 3;

/**
 * Hair dyes tried on your own hair ("none") or on the look's hairstyle (1 unit each, cached).
 * The hairstyle result is uploaded to YouCam once so the dye can be applied on top of it.
 */
export async function tryOnHairDyes(fileId: string, lookFileId: string, base: HairBase, ids: string[]): Promise<TryOnOutcome[]> {
  const dyes = ids.slice(0, MAX_HAIR_DYES_PER_REQUEST).map(getHairDye).filter((d): d is HairDye => !!d);

  if (isDemoMode()) {
    const rec = readDemoManifest()?.hairColor?.[base] ?? {};
    return dyes.map((d) => (rec[d.id] ? { productId: d.id, image: toDataUrl(readPublic(rec[d.id])) } : { productId: d.id, error: "Not in the recorded demo session." }));
  }

  const srcId = base === "none"
    ? fileId
    : await cached(`hairfile:${fileId}:${lookFileId}:${base}`, 20 * HOUR, async () =>
        uploadImage(await prepareImage(await hairBytes(fileId, lookFileId, base), TRANSFER_MAX_SIDE), "hairstyle.jpg", TRANSFER_MAX_SIDE, { prepared: true }));

  console.info(`[look] hair dye on ${base === "none" ? "your own hair" : "the look's hairstyle"}: ${dyes.map((d) => d.id).join(", ")}`);
  const out: TryOnOutcome[] = [];
  for (let i = 0; i < dyes.length; i += 2) {
    out.push(...(await Promise.all(dyes.slice(i, i + 2).map(async (d): Promise<TryOnOutcome> => {
      try {
        const attempt = async () => download((await tryOnHairColor(srcId, { hex: d.hex })).url);
        const bytes = await cached(`dye:${srcId}:${d.hex}`, 1.5 * HOUR, async () => {
          try {
            return await attempt();
          } catch (first) {
            if (first instanceof YouCamError && first.code?.startsWith("error_")) throw first;
            console.warn(`[look] hair dye ${d.id} failed, retrying once: ${(first as Error).message}`);
            await new Promise((r) => setTimeout(r, 1500));
            return attempt();
          }
        });
        if (isRecording()) {
          writeDemoFile(`dye-${base}-${d.id}.jpg`, bytes, (m) => {
            m.hairColor = { ...(m.hairColor ?? {}), [base]: { ...(m.hairColor?.[base] ?? {}), [d.id]: `/demo/look/dye-${base}-${d.id}.jpg` } };
          });
        }
        return { productId: d.id, image: toDataUrl(bytes) };
      } catch (err) {
        console.error(`[look] hair dye ${d.id} failed: ${(err as Error).message}`);
        return { productId: d.id, error: (err as Error).message };
      }
    }))));
  }
  return out;
}

// --- Brows ---------------------------------------------------------------------------

/** Brow color try-ons on the selfie (1 unit each, cached). The browser copies only the brows into "Your look". */
export async function tryOnBrows(fileId: string, ids: string[]): Promise<TryOnOutcome[]> {
  const brows = ids.slice(0, 2).map(getBrow).filter((b): b is BrowProduct => !!b);
  if (isDemoMode()) {
    const rec = readDemoManifest()?.brows ?? {};
    return brows.map((b) => (rec[b.id] ? { productId: b.id, image: toDataUrl(readPublic(rec[b.id])) } : { productId: b.id, error: "Not in the recorded demo session." }));
  }
  console.info(`[look] brow color: ${brows.map((b) => b.id).join(", ")}`);
  return Promise.all(brows.map(async (b): Promise<TryOnOutcome> => {
    try {
      const bytes = await cached(`brow:${fileId}:${b.hex}:${BROW_INTENSITY}`, 1.5 * HOUR, async () => download((await tryOnBrowColor(fileId, b.hex)).url));
      if (isRecording()) writeDemoFile(`brow-${b.id}.jpg`, bytes, (m) => { m.brows = { ...(m.brows ?? {}), [b.id]: `/demo/look/brow-${b.id}.jpg` }; });
      return { productId: b.id, image: toDataUrl(bytes) };
    } catch (err) {
      console.error(`[look] brow ${b.id} failed: ${(err as Error).message}`);
      return { productId: b.id, error: (err as Error).message };
    }
  }));
}
