// Helper CLI for the real YouCam API (uses YOUCAM_API_KEY from .env.local).
//
//   npm run week1 -- costs                       per-feature unit costs (free)
//   npm run week1 -- balance                     your YouCam account credit balance (free)
//   npm run week1 -- units                       units spent so far by this project (free)
//   npm run week1 -- tryon <selfie> [productId]  one real lipstick try-on (1 unit)
//   npm run week1 -- transfer <selfie> <look>    copy a makeup look onto the selfie (2 units)
//   npm run week1 -- blush <selfie> <#hex> [matte|satin|shimmer] [intensity]   one blush try-on (1 unit)
//   npm run week1 -- faces [all | preset ids…]    AI-generated test faces into selfies/ (1 unit each)
//   npm run week1 -- face "<description>"        one AI face from your own description (1 unit)
//   npm run week1 -- looks [all | preset ids…]    AI-generated makeup "look" photos (lipstick, blush, hair) into selfies/ (1 unit each)
//
// Commands that spend units print an estimate and only run with --yes.
// Results go to week1-results/ (git-ignored: they show real faces).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  TRANSFER_MAX_SIDE, creditBalance, explainYouCamError, featureCosts, generateImage, transferMakeup, tryOnBlush, tryOnLipstick, uploadImage,
} from "@/lib/youcam";
import { FACE_PRESETS, facePrompt, LOOK_NEGATIVE_PROMPT, LOOK_PREFIX, LOOK_PRESETS, lookPrompt, NEGATIVE_PROMPT, SYNTHETIC_PREFIX } from "@/lib/synthetic-faces";
import { catalog, getProduct } from "@/data/catalog";
import { UNIT_COSTS, budget, unitsRemaining, unitsSpent } from "@/lib/units";

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const [, , command, ...rest] = process.argv;
const confirmed = rest.includes("--yes");
const args = rest.filter((a) => a !== "--yes");
const OUT_DIR = "week1-results";

/** Fails with the missing path and the files that do exist next to it. */
function requireFile(file: string | undefined, usage: string): string {
  if (!file) throw new Error(usage);
  if (!existsSync(file)) {
    const dir = path.dirname(file);
    const nearby = existsSync(dir) ? readdirSync(dir).filter((f) => IMAGE_EXT.test(f) || /\.heic$/i.test(f)) : [];
    throw new Error(`File not found: ${file}${nearby.length ? `\nFiles in ${dir}: ${nearby.join(", ")}` : ""}`);
  }
  return file;
}

function requireConfirm(what: string, units: number) {
  console.log(`\nThis spends about ${units} YouCam units (${what}).`);
  console.log(`Budget: ${unitsSpent()} spent of ${budget()} (UNIT_BUDGET), ${unitsRemaining()} left.`);
  if (units > unitsRemaining()) {
    console.log("Not enough budget left. Raise UNIT_BUDGET in .env.local if you mean to spend more.");
    process.exit(1);
  }
  if (confirmed) return;
  console.log("Check costs first with `npm run week1 -- costs`, then re-run with --yes.");
  process.exit(0);
}

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/** Task paths this app uses, matched against each SKU's run_task_url. */
const USED_FEATURES = ["/task/makeup-vto", "/task/mu-transfer"];

async function costs() {
  const skus = await featureCosts();
  const rows = skus.map((s) => ({
    used: USED_FEATURES.some((f) => s.run_task_url.includes(f)) ? "★" : "",
    feature: s.description,
    units: s.amount,
    per: s.unit,
    endpoint: s.run_task_url.replace(/^https?:\/\/[^/]+/, ""),
  }));
  rows.sort((a, b) => b.used.localeCompare(a.used) || a.feature.localeCompare(b.feature));
  console.table(rows);
  console.log(`${skus.length} features. ★ = used by Steal the Look.`);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "feature-costs.json"), JSON.stringify(skus, null, 2));
  console.log(`Saved ${OUT_DIR}/feature-costs.json`);
}

async function balance() {
  console.log(JSON.stringify(await creditBalance(), null, 2));
}

async function units() {
  console.log(`Spent ${unitsSpent()} of ${budget()} budgeted units on this machine; ${unitsRemaining()} left.`);
  console.log("Check your real balance with `npm run week1 -- balance`; this ledger only counts calls made from this project.");
}

/** One real lipstick try-on, saved to week1-results/. */
async function tryon(selfie: string | undefined, productId = "aur-coral") {
  requireFile(selfie, "Usage: npm run week1 -- tryon <selfie.jpg> [productId] --yes");
  const product = getProduct(productId);
  if (!product) {
    throw new Error(`Unknown product "${productId}". Examples: ${catalog.slice(0, 6).map((p) => p.id).join(", ")} (see the lip lab for more).`);
  }
  requireConfirm(`1 makeup try-on of ${product.id}`, UNIT_COSTS["makeup-vto"]);
  const fileId = await uploadImage(readFileSync(selfie!), path.basename(selfie!));
  const { url } = await tryOnLipstick(fileId, product);
  const out = path.join(OUT_DIR, `tryon-${product.id}-${Date.now()}.jpg`);
  await download(url, out);
  console.log(`✓ Real makeup-vto call worked. Result saved to ${out}.`);
}

/** Puts the look from an inspiration photo onto the selfie (Makeup Transfer). */
async function transfer(selfie: string | undefined, inspiration: string | undefined) {
  const usage = "Usage: npm run week1 -- transfer <selfie.jpg> <inspiration.jpg> --yes";
  requireFile(selfie, usage);
  requireFile(inspiration, usage);
  requireConfirm("1 makeup transfer", UNIT_COSTS["mu-transfer"]);
  const src = await uploadImage(readFileSync(selfie!), path.basename(selfie!), TRANSFER_MAX_SIDE);
  const ref = await uploadImage(readFileSync(inspiration!), path.basename(inspiration!), TRANSFER_MAX_SIDE);
  const { url } = await transferMakeup(src, ref);
  const out = path.join(OUT_DIR, `transfer-${path.parse(inspiration!).name}-${Date.now()}.jpg`);
  await download(url, out);
  console.log(`✓ Real mu-transfer call worked. Result saved to ${out}.`);
}

/** One real blush try-on, saved to week1-results/. */
async function blush(selfie: string | undefined, hex: string | undefined, texture = "matte", intensity = "60") {
  const usage = "Usage: npm run week1 -- blush <selfie.jpg> <#hex> [matte|satin|shimmer] [intensity 0-100] --yes";
  requireFile(selfie, usage);
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new Error(`${usage}\nColor must look like #E58A8A`);
  if (!["matte", "satin", "shimmer"].includes(texture)) throw new Error(usage);
  requireConfirm(`1 blush try-on (${hex}, ${texture})`, UNIT_COSTS["makeup-vto"]);
  const fileId = await uploadImage(readFileSync(selfie!), path.basename(selfie!), TRANSFER_MAX_SIDE);
  const { url } = await tryOnBlush(fileId, { hex, texture: texture as "matte" | "satin" | "shimmer", intensity: Number(intensity) });
  const out = path.join(OUT_DIR, `blush-${hex.slice(1)}-${texture}-${Date.now()}.jpg`);
  await download(url, out);
  console.log(`✓ Real blush try-on worked. Result saved to ${out}. Measure it in /lab/blush.`);
}

/** Generates synthetic test faces (YouCam AI Image Generator) into selfies/ with the synthetic- prefix. */
async function faces(ids: string[]) {
  const wanted = ids.length === 0 || ids.includes("all") ? FACE_PRESETS : FACE_PRESETS.filter((p) => ids.includes(p.id));
  if (!wanted.length) throw new Error(`Unknown preset. Choose from: all, ${FACE_PRESETS.map((p) => p.id).join(", ")}`);
  await generateFaces(wanted.map((p) => ({ id: p.id, person: p.description })));
}

async function face(description: string | undefined) {
  if (!description?.trim()) throw new Error('Usage: npm run week1 -- face "a Southeast Asian man in his 60s with medium skin and brown-rose lips" --yes');
  await generateFaces([{ id: "custom", person: description }]);
}

async function generateFaces(jobs: { id: string; person: string }[]) {
  requireConfirm(`${jobs.length} AI-generated face${jobs.length > 1 ? "s" : ""}`, jobs.length * UNIT_COSTS["text-to-image/youcam"]);
  mkdirSync("selfies", { recursive: true });
  for (const job of jobs) {
    process.stdout.write(`Generating ${job.id}… `);
    try {
      const { url } = await generateImage(facePrompt(job.person), { negativePrompt: NEGATIVE_PROMPT });
      const out = path.join("selfies", `${SYNTHETIC_PREFIX}${job.id}-${Date.now()}.jpg`);
      await download(url, out);
      console.log(`✓ ${out}`);
    } catch (err) {
      console.log(`✗ ${explainYouCamError(err)}`);
    }
  }
  console.log("Check each face in the lip lab before using it in an audit (lips found, one face, front-facing).");
}

/** Makeup "look" photos for the shopper flow: AI-generated, so no real person's photo is used. */
async function looks(ids: string[]) {
  const wanted = ids.length === 0 || ids.includes("all") ? LOOK_PRESETS : LOOK_PRESETS.filter((p) => ids.includes(p.id));
  if (!wanted.length) throw new Error(`Unknown look. Choose from: all, ${LOOK_PRESETS.map((p) => p.id).join(", ")}`);
  requireConfirm(`${wanted.length} AI-generated look photo${wanted.length > 1 ? "s" : ""}`, wanted.length * UNIT_COSTS["text-to-image/youcam"]);
  mkdirSync("selfies", { recursive: true });
  for (const look of wanted) {
    process.stdout.write(`Generating ${look.id} (${look.label})… `);
    try {
      const { url } = await generateImage(lookPrompt(look), { negativePrompt: LOOK_NEGATIVE_PROMPT });
      const out = path.join("selfies", `${LOOK_PREFIX}${look.id}-${Date.now()}.jpg`);
      await download(url, out);
      console.log(`✓ ${out}`);
    } catch (err) {
      console.log(`✗ ${explainYouCamError(err)}`);
    }
  }
  console.log("Open each one, keep the ones with clear lipstick, visible blush, eyes uncovered and shoulders in view, and label them AI-generated wherever you show them.");
}

const commands: Record<string, () => Promise<void>> = {
  costs,
  balance,
  units,
  tryon: () => tryon(args[0], args[1]),
  transfer: () => transfer(args[0], args[1]),
  faces: () => faces(args),
  blush: () => blush(args[0], args[1], args[2], args[3]),
  face: () => face(args.join(" ")),
  looks: () => looks(args),
};

const run = commands[command ?? ""];
if (!run) {
  if (command) console.log(`Unknown command "${command}".`);
  console.log("Usage: npm run week1 -- <costs | balance | units | tryon <selfie> [productId] | transfer <selfie> <look> | faces [all|ids…] | face \"<description>\" | looks [all|ids…]>  [--yes]");
  process.exit(1);
}
run().catch((err) => {
  console.error(explainYouCamError(err));
  if (/^error_|Task failed/.test((err as Error)?.message ?? "")) console.error("No units are charged for failed tasks.");
  process.exit(1);
});
