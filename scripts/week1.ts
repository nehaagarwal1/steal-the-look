// Helper CLI for the real YouCam API (uses YOUCAM_API_KEY from .env.local).
//
//   npm run week1 -- costs                       per-feature unit costs (free)
//   npm run week1 -- balance                     your YouCam account credit balance (free)
//   npm run week1 -- units                       units spent so far by this project (free)
//   npm run week1 -- tryon <selfie> [productId]  one real lipstick try-on (1 unit)
//   npm run week1 -- transfer <selfie> <look>    copy a makeup look onto the selfie (2 units)
//
// Commands that spend units print an estimate and only run with --yes.
// Results go to week1-results/ (git-ignored: they show real faces).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  TRANSFER_MAX_SIDE, creditBalance, explainYouCamError, featureCosts, transferMakeup, tryOnLipstick, uploadImage,
} from "@/lib/youcam";
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

const commands: Record<string, () => Promise<void>> = {
  costs,
  balance,
  units,
  tryon: () => tryon(args[0], args[1]),
  transfer: () => transfer(args[0], args[1]),
};

const run = commands[command ?? ""];
if (!run) {
  if (command) console.log(`Unknown command "${command}".`);
  console.log("Usage: npm run week1 -- <costs | balance | units | tryon <selfie> [productId] | transfer <selfie> <look>> [--yes]");
  process.exit(1);
}
run().catch((err) => {
  console.error(explainYouCamError(err));
  if (/^error_|Task failed/.test((err as Error)?.message ?? "")) console.error("No units are charged for failed tasks.");
  process.exit(1);
});
