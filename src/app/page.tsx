"use client";
// Pretty Smart: "Pretty looks. Smart picks."
// Tabs: My photos → Lipstick → Blush → Hair & brows → My look & cart. Wording is in the shopper's voice ("me", "my").

import { useEffect, useRef, useState } from "react";
import { getProduct, type LipProduct } from "@/data/catalog";
import { getBlush } from "@/data/blush-catalog";
import type { LipResult } from "@/lib/lips/detect";
import { bestBuy, buildProof, DUPE_DELTA_E, estimateShift, groupByFamily, mergeProfile, pickCalibrated, pickCandidates, refineCandidates, type LipProfile, type ProofCard } from "@/lib/lips/plan";
import type { LipTones } from "@/lib/lips/measure";
import { HAIR_FAMILIES, hairFamily, type HairDye } from "@/data/hair-catalog";
import { hairDupe, measureDyedHair, type HairDupeVerdict } from "@/lib/hair/compare";
import { BROW_FAMILIES, browFamily, type BrowProduct } from "@/data/brow-catalog";
import { adviseBrows } from "@/lib/hair/brows";
import { keptTotal } from "@/lib/kept";
import { sourceFromFilename } from "@/lib/synthetic-faces";
import { Twinning } from "./twinning";
import { cleanFirstName, loadFirstName, MAX_NAME_LENGTH, saveFirstName } from "@/lib/first-name";
import { forgetProfile, loadProfile, saveProfile, selfieFingerprint } from "@/lib/lip-profile";
import { colorName, deltaE2000 } from "@/lib/color";
import { explainShade } from "@/lib/lips/explain";
import { describeFinishMismatch, type Finish } from "@/lib/lips/finish";
import { shareCaption, shareFacts } from "@/lib/share";
import type { BlushProduct } from "@/data/blush-catalog";
import type { CheekResult } from "@/lib/lips/detect";
import {
  bestBlush, buildBlushProof, DEFAULT_STRENGTH, fitStrength, hasBlush, rankBlushFamilies, type BlushCard, type BlushSample,
} from "@/lib/blush/plan";

type Config = { demo: boolean; demoReady: boolean; demoProducts: string[]; demoBlush?: string[]; demoHair?: string[]; demoBrows?: string[]; demoHairColor?: Partial<Record<HairBase, string[]>> };
type HairBase = "ref" | "src" | "none";
type DyeTry = {
  premium: { product: HairDye; image: string }; budget?: { product: HairDye; image: string }; dupe?: HairDupeVerdict; note?: string;
  /** Measured hair color before and with each dye (for brow advice). */
  before?: string; colors?: Record<string, string>;
};
type BrowTry = {
  premium: { product: BrowProduct; image: string; crop?: string }; budget?: { product: BrowProduct; image: string; crop?: string };
  dupe?: HairDupeVerdict; note?: string;
  /** Close-up of your natural brows, for comparison. */
  natural?: string;
};
type Tab = "photos" | "lipstick" | "blush" | "hair" | "look";
type Start = { fileId: string; lookFileId: string; selfieImage: string; transferImage: string; lookImage?: string; lookSynthetic?: boolean };
type Stage = "upload" | "transferring" | "preview" | "trying" | "proof";

const detect = () => import("@/lib/lips/detect"); // MediaPipe loads only when needed

/** Checks a photo in the browser before anything is uploaded (free). */
async function checkPhoto(file: File): Promise<LipResult> {
  const { measureLipsInImage, toBitmap } = await detect();
  return measureLipsInImage(await toBitmap(file));
}

function photoProblem(r: LipResult | null): string | null {
  if (!r) return null;
  if (!r.faceFound) return "No face found. Use a clear, front-facing photo.";
  if (r.faceCount > 1) return "This photo has more than one person. Use a photo of just one face.";
  if (r.confidence === "low") return `Hard to read the lips: ${r.reasons.join("; ")}.`;
  return null;
}

const label = (p: { shade: string; name: string }) => `${p.shade}, ${p.name}`;

/** `calibrated`: picked using how colors shift on these lips (round 2, or a saved lip profile). */
/** Anything that can go in the cart (lipsticks and blushes). */
type CartItem = { id: string; name: string; shade: string; price: number };

/** `image`: lips-only on your photo (for display); `raw`: YouCam's try-on as returned (reference for combining). */
type ShadeCard = ProofCard & { crop?: string; image: string; raw?: string; calibrated: boolean };

const cap = (w: string) => `${w[0].toUpperCase()}${w.slice(1)}`;

/** Color explanation plus a finish note when the finish differs from the look. */
function whyText(targetHex: string, card: ProofCard, lookFinish?: Finish): string {
  const e = explainShade(targetHex, card.hex, card.deltaE);
  const finishNote = lookFinish ? describeFinishMismatch(card.finish, lookFinish) : null;
  return [e.difference, finishNote, e.takeaway].filter(Boolean).join(" ");
}

/** fetch that gives up after `ms` with a readable error, so the page never spins forever. */
async function fetchJson(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const json = await res.json().catch(() => ({ error: `Server error (${res.status}). Check the terminal running npm run dev.` }));
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`This took longer than ${Math.round(ms / 1000)} seconds and was stopped. Please try again; if it keeps happening, check the terminal running npm run dev.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Runs a browser step with a time limit and a console trace, so a stuck step shows up as an error. */
async function step<T>(name: string, ms: number, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  console.info(`[look] ${name}…`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`"${name}" took longer than ${ms / 1000}s. Reload the page and try again.`)), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
    console.info(`[look] ${name} done in ${Math.round(performance.now() - t0)} ms`);
  }
}

/** Shows "… (12s)" while a slow step runs. Returns a stop function. */
function tickStatus(set: (s: string) => void, text: string) {
  const t0 = Date.now();
  set(text);
  const id = setInterval(() => set(`${text} (${Math.round((Date.now() - t0) / 1000)}s)`), 1000);
  return () => clearInterval(id);
}

export default function Home() {
  const [config, setConfig] = useState<Config | null>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [selfie, setSelfie] = useState<File | null>(null);
  const [look, setLook] = useState<File | null>(null);
  // The original look photo, for the "Twinning" ending (demo mode gets it from the recording instead).
  const [lookUrl, setLookUrl] = useState("");
  useEffect(() => {
    if (!look) return setLookUrl("");
    const u = URL.createObjectURL(look);
    setLookUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [look]);
  /** The look photo may show a friend: it goes to YouCam, so the shopper must confirm permission. */
  const [lookConsent, setLookConsent] = useState(false);
  const [selfieCheck, setSelfieCheck] = useState<LipResult | null>(null);
  const [lookCheck, setLookCheck] = useState<LipResult | null>(null);

  const [start, setStart] = useState<Start | null>(null);
  const [lipsOnly, setLipsOnly] = useState("");
  const [showFull, setShowFull] = useState(false);
  /** "Compare before & after": the original selfie next to the result. */
  const [compare, setCompare] = useState(false);
  const [target, setTarget] = useState<LipResult | null>(null);
  /** Optional first name for the greeting, stored only in this browser. */
  const [firstName, setFirstName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  useEffect(() => { setFirstName(loadFirstName()); }, []);
  /** Saved lip profile for this selfie (numbers only, stored in this browser). */
  const [profileKey, setProfileKey] = useState<string | null>(null);
  const [profile, setProfile] = useState<LipProfile | null>(null);

  const [cards, setCards] = useState<ShadeCard[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [blush, setBlush] = useState<{ cards: (BlushCard & { crop?: string; image?: string; raw?: string })[]; targetCrop?: string; targetFull?: string; tryOns: number } | null>(null);
  /** Results show lip/cheek close-ups (best for judging the color match) or full faces (best for judging the look). */
  const [view, setView] = useState<"closeup" | "full">("closeup");
  // Shades chosen for "Your look" (null = the best buy).
  const [pickLip, setPickLip] = useState<string | null>(null);
  const [pickBlush, setPickBlush] = useState<string | null>(null);
  const [myLook, setMyLook] = useState("");
  // The look's hairstyle on your photo, per hair-color mode ("ref" = the look's color, "src" = yours).
  const [hair, setHair] = useState<Partial<Record<"ref" | "src", string>>>({});
  const [hairMode, setHairMode] = useState<"ref" | "src">("ref");
  const [useHair, setUseHair] = useState(true);
  const [hairBusy, setHairBusy] = useState(false);
  const [hairNote, setHairNote] = useState("");
  // Hair dye: tries per "base:family", the chosen dye (null = keep the hair color as it is).
  const [dyeTries, setDyeTries] = useState<Record<string, DyeTry>>({});
  const [dyeFamily, setDyeFamily] = useState<string | null>(null);
  const [pickDye, setPickDye] = useState<string | null>(null);
  const [dyeBusy, setDyeBusy] = useState(false);
  // Brow color (tinted gel / pencil), tried on the selfie; only the brows are copied into "Your look".
  const [browTries, setBrowTries] = useState<Record<string, BrowTry>>({});
  const [browFamilyKey, setBrowFamilyKey] = useState<string | null>(null);
  const [pickBrow, setPickBrow] = useState<string | null>(null);
  const [browBusy, setBrowBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("photos");
  /** The "Your look" picture is being recombined after a pick changed. */
  const [lookUpdating, setLookUpdating] = useState(false);
  const [blushNote, setBlushNote] = useState("");
  const [blushBusy, setBlushBusy] = useState(false);
  const [shareImage, setShareImage] = useState<{ url: string; blob: Blob; caption: string } | null>(null);
  /** How much work the last search took, shown with the results. */
  const [effort, setEffort] = useState<{ rounds: number; tryOns: number; usedProfile: boolean } | null>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    fetch("/api/look/config").then((r) => r.json()).then(setConfig).catch(() => setConfig({ demo: false, demoReady: false, demoProducts: [] }));
  }, []);

  async function onPick(kind: "selfie" | "look", file: File | null) {
    setError("");
    if (kind === "selfie") { setSelfie(file); setSelfieCheck(null); } else { setLook(file); setLookCheck(null); setLookConsent(false); }
    if (!file) return;
    setStatus(`Checking my ${kind === "selfie" ? "selfie (looking good already 😉)" : "look photo"}…`);
    try {
      const r = await checkPhoto(file);
      if (kind === "selfie") setSelfieCheck(r); else setLookCheck(r);
      setStatus("");
    } catch (e) {
      setError(`Couldn't read that photo: ${(e as Error).message}`);
    }
  }

  async function seeItOnMe() {
    setError("");
    setStage("transferring");
    const stop = tickStatus(setStatus, "✨ Recreating your look… usually 15–40 seconds");
    try {
      const form = new FormData();
      if (selfie) form.append("selfie", selfie);
      if (look) form.append("look", look);
      if (lookConsent) form.append("consent", "yes");
      const s = (await fetchJson("/api/look/start", { method: "POST", body: form }, 120_000)) as Start;
      stop();
      setStatus("Finding my lips in the result…");

      const { lipsOnlyComposite, measureLipsInImage, toBitmap } = await step("loading face model", 30_000, detect);
      const [selfieBmp, transferBmp] = await step("decoding images", 15_000, () => Promise.all([toBitmap(s.selfieImage), toBitmap(s.transferImage)]));
      const composite = await step("building lips-only preview", 30_000, () => lipsOnlyComposite(selfieBmp, transferBmp));
      const t = await step("measuring target lips", 15_000, () => measureLipsInImage(transferBmp));
      if (!t.faceFound) throw new Error("Couldn't find the lips in the result. Try a clearer selfie.");
      // In demo mode the look photo comes from the recording.
      if (s.lookImage) {
        const lookImage = s.lookImage;
        setLookCheck(await step("measuring look photo", 15_000, async () => measureLipsInImage(await toBitmap(lookImage))));
      }

      setStart(s);
      setLipsOnly(composite.toDataURL("image/jpeg", 0.9));
      setTarget(t);
      const key = await selfieFingerprint(s.selfieImage);
      setProfileKey(key);
      setProfile(loadProfile(key));
      setStage("preview");
      setStatus(`Look at you${firstName ? `, ${firstName}` : ""}! 😍 This look was made for you. Ready to find my perfect shade?`);
    } catch (e) {
      stop();
      setStage("upload");
      setStatus("");
      setError((e as Error).message);
    }
  }

  type MeasuredShade = { product: LipProduct; hex: string; tones?: LipTones; crop?: string; image: string; raw?: string; calibrated: boolean };

  /** Tries shades on the selfie (YouCam) and measures each result's lips (browser). */
  async function tryAndMeasure(picks: LipProduct[], text: string, calibrated: boolean): Promise<{ measured: MeasuredShade[]; failed: LipProduct[] }> {
    const stop = tickStatus(setStatus, text);
    try {
      const json = await fetchJson("/api/look/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: start!.fileId, productIds: picks.map((p) => p.id) }),
      }, 180_000);
      stop();
      setStatus("Swatching every shade on my lips… 💋");
      const { measureLipsInImage, lipsOnlyComposite, toBitmap } = await step("loading face model", 30_000, detect);
      const selfieBmp = await toBitmap(start!.selfieImage);
      const measured: MeasuredShade[] = [];
      const failed: LipProduct[] = [];
      for (const product of picks) {
        const r = (json.results as { productId: string; image?: string }[]).find((x) => x.productId === product.id);
        const img = r?.image;
        const bmp = img ? await toBitmap(img) : null;
        const m = bmp ? await step(`measuring ${product.id}`, 15_000, async () => measureLipsInImage(bmp)) : null;
        if (bmp && m?.faceFound) {
          // Full-face picture: only the lips from the try-on, on your own photo (YouCam also smooths/brightens the skin).
          const full = await step(`lips-only ${product.id}`, 15_000, async () => (await lipsOnlyComposite(selfieBmp, bmp)).toDataURL("image/jpeg", 0.9));
          measured.push({ product, hex: m.hex, tones: m.tones, crop: m.lipCrop, image: full, raw: img, calibrated });
        }
        else failed.push(product);
      }
      return { measured, failed };
    } finally {
      stop();
    }
  }

  async function findForLess() {
    if (!start || !target) return;
    if (!lookCheck) { setError("The look photo hasn't been measured yet. Press Start over and try again."); return; }
    setError("");
    setStage("trying");
    const allowed = config?.demo ? new Set(config.demoProducts) : undefined;
    try {
      // Round 1: with a saved lip profile, pick shades already corrected for these lips;
      // otherwise, shades closest to the look photo.
      const lookFinish = lookCheck.finish;
      const picks = profile
        ? pickCalibrated(target.hex, profile.shift, { families: 2, allowed, finish: lookFinish })
        : pickCandidates(lookCheck.hex, { families: 2, allowed, finish: lookFinish });
      const round1 = await tryAndMeasure(
        picks,
        profile ? `Using my lip profile: trying ${picks.length} shades on my face…` : `Trying ${picks.length} matching shades on my face…`,
        !!profile,
      );
      let rounds = 1;
      let measured = round1.measured;
      const failed = [...round1.failed];
      if (!measured.length) throw new Error("None of the try-ons worked. Please try again.");

      // Round 2: if nothing is very close yet, calibrate to these lips and try adjusted shades.
      const closest = Math.min(...measured.map((m) => deltaE2000(target.hex, m.hex)));
      if (closest >= DUPE_DELTA_E) {
        const { picks: refined } = refineCandidates(target.hex, measured, { families: 1, allowed, finish: lookFinish });
        if (refined.length) {
          const round2 = await tryAndMeasure(refined, "Calibrating to my lips: trying adjusted shades…", true);
          rounds = 2;
          measured = [...measured, ...round2.measured];
          failed.push(...round2.failed);
        }
      }

      const proof = buildProof(target.hex, measured, lookFinish, target.tones).map((c) => {
        const m = measured.find((x) => x.product.id === c.product.id)!;
        return { ...c, crop: m.crop, image: m.image, raw: m.raw, calibrated: m.calibrated };
      });
      setCards(proof);
      setStage("proof");
      const best = bestBuy(proof, undefined, target.hex);
      const failNote = failed.length ? ` ${failed.length} shade${failed.length > 1 ? "s" : ""} couldn't be tried (${failed.map((p) => p.shade).join(", ")}).` : "";

      // Learn from this look: fold how colors shifted on these lips into the saved profile.
      let profileNote = "";
      const shift = estimateShift(target.hex, measured);
      if (shift && profileKey) {
        const updated = mergeProfile(profile, shift);
        if (saveProfile(profileKey, updated)) {
          setProfile(updated);
          profileNote = ` Lip profile saved (${updated.looks} look${updated.looks > 1 ? "s" : ""}).`;
        }
      }
      const tryOns = measured.length + failed.length;
      setEffort({ rounds, tryOns, usedProfile: !!profile });
      const effortNote = ` Found in ${rounds} round${rounds > 1 ? "s" : ""} (${tryOns} try-ons).`;
      setStatus((best ? `Found my shade 💄 ${label(best.product)}, ${best.score}% match for $${best.product.price}${best.savings ? `, and $${best.savings} goes in my kitty 💰` : ""}.` : "") + effortNote + failNote + profileNote);
      setTab("lipstick");
      setTimeout(() => resultsRef.current?.focus(), 0);
    } catch (e) {
      setStage("preview");
      setStatus("");
      setError((e as Error).message);
    }
  }

  /** Each product goes in the cart once. */
  function addToCart(...items: CartItem[]) {
    const fresh = items.filter((p, i) => !cart.some((c) => c.id === p.id) && items.findIndex((q) => q.id === p.id) === i);
    if (!fresh.length) return setStatus(`${items.map(label).join(" and ")} ${items.length > 1 ? "are" : "is"} already in my cart.`);
    const next = [...cart, ...fresh];
    setCart(next);
    setStatus(`Added ${fresh.map((p) => `${label(p)} for $${p.price}`).join(" and ")}. Cart total $${next.reduce((sum, i) => sum + i.price, 0)}.`);
  }

  function removeFromCart(id: string) {
    const next = cart.filter((c) => c.id !== id);
    setCart(next);
    setStatus(`Removed. Cart total $${next.reduce((sum, i) => sum + i.price, 0)}.`);
  }

  const inCart = (id: string) => cart.some((c) => c.id === id);

  async function makeShareCard() {
    const b = bestBuy(cards, undefined, target?.hex);
    const crop = cards.find((c) => c.product.id === b?.product.id)?.crop;
    if (!b || !crop || !target?.lipCrop) return;
    try {
      const { renderShareCard } = await import("@/lib/share-card");
      const facts = shareFacts(b, lookCheck?.finish);
      const blob = await renderShareCard(facts, target.lipCrop, crop);
      if (shareImage) URL.revokeObjectURL(shareImage.url);
      setShareImage({ url: URL.createObjectURL(blob), blob, caption: shareCaption(facts) });
      setStatus("My result card is ready below. Time to show off ✨");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function shareCard() {
    if (!shareImage) return;
    const file = new File([shareImage.blob], "pretty-smart.png", { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareImage.caption });
      } else {
        await navigator.clipboard.writeText(shareImage.caption);
        setStatus("Sharing isn't supported in this browser, so the caption was copied. Download the image to post it.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(`Sharing failed: ${(e as Error).message}`);
    }
  }

  /** Blush: measure the look's blush on you, try predicted shades, learn how blush shows on these cheeks, prove. */
  async function matchBlush() {
    if (!start) return;
    setError("");
    setBlushNote("");
    setBlushBusy(true);
    const allowed = config?.demo ? new Set(config.demoBlush ?? []) : undefined;
    try {
      const { blushOnBareCheeks, cheeksOnlyComposite, measureCheeksInImage, toBitmap } = await step("loading face model", 30_000, detect);
      const bareBitmap = await toBitmap(start.selfieImage);
      const bare: CheekResult = await step("measuring bare cheeks", 15_000, async () => measureCheeksInImage(bareBitmap));
      const look: CheekResult = await step("measuring the look's blush", 15_000, async () => measureCheeksInImage(await toBitmap(start.transferImage)));
      if (!bare.tint || !look.tint || !bare.cheek) throw new Error(`Couldn't measure the cheeks: ${[...bare.reasons, ...look.reasons].join("; ") || "no face found"}.`);
      if (!hasBlush(look.tint, bare.tint)) {
        setBlushNote("This look has little or no blush, so there's nothing to match on the cheeks.");
        return;
      }
      const base = bare.tint, target = look.tint, bareCheek = bare.cheek;
      // Fair picture of the target: only the look's blush, added to your bare cheeks (no foundation change).
      const lookOnBare = await step("drawing the look's blush on my bare cheeks", 15_000, () =>
        blushOnBareCheeks(bareBitmap, { dL: target.dL - base.dL, da: target.da - base.da, db: target.db - base.db }));

      const tryBlush = async (picks: BlushProduct[], text: string) => {
        const stop = tickStatus(setStatus, text);
        try {
          const json = await fetchJson("/api/look/blush", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: start.fileId, productIds: picks.map((p) => p.id) }),
          }, 180_000);
          stop();
          const out: (BlushSample & { crop?: string; image?: string; raw?: string })[] = [];
          for (const p of picks) {
            const r = (json.results as { productId: string; image?: string }[]).find((x) => x.productId === p.id);
            if (!r?.image) continue;
            const img = r.image;
            const bmp = await toBitmap(img);
            const m = await step(`measuring blush ${p.id}`, 15_000, async () => measureCheeksInImage(bmp));
            // Full-face picture: only the cheeks from the try-on, on your bare photo.
            const full = await step(`cheeks-only ${p.id}`, 15_000, async () => (await cheeksOnlyComposite(bareBitmap, bmp)).toDataURL("image/jpeg", 0.9));
            if (m.tint) out.push({ product: p, tint: m.tint, crop: m.cheekCrop, image: full, raw: img });
          }
          return out;
        } finally {
          stop();
        }
      };

      // Round 1: two shades predicted to land closest, using a starting guess of how blush shows.
      const ranked1 = rankBlushFamilies(target, base, bareCheek, DEFAULT_STRENGTH, { allowed });
      let samples = await tryBlush(ranked1.slice(0, 2).map((f) => f.premium), "Trying 2 blushes on my cheeks…");
      if (!samples.length) throw new Error("None of the blush try-ons worked. Please try again.");

      // Round 2: learn how strongly blush shows on these cheeks, then try the best shade's premium + budget versions.
      const strength = fitStrength(samples, base, bareCheek);
      const best = rankBlushFamilies(target, base, bareCheek, strength, { allowed })[0];
      const tried = new Set(samples.map((x) => x.product.id));
      const round2 = best ? [best.premium, best.cheapest].filter((p, i, arr) => !tried.has(p.id) && arr.findIndex((q) => q.id === p.id) === i) : [];
      if (round2.length) samples = [...samples, ...(await tryBlush(round2, "Calibrating to my cheeks: trying the best match at two prices…"))];

      const cards = buildBlushProof(target, samples).map((c) => { const smp = samples.find((x) => x.product.id === c.product.id); return { ...c, crop: smp?.crop, image: smp?.image, raw: smp?.raw }; });
      setBlush({ cards, targetCrop: lookOnBare.crop, targetFull: lookOnBare.full, tryOns: samples.length });
      const b = bestBlush(cards);
      setStatus(b ? `Found my glow 🌸 ${label(b.product)}, ${b.score}% match for $${b.product.price}${b.savings ? `, and $${b.savings} goes in my kitty 💰` : ""}.` : "");
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
    } finally {
      setBlushBusy(false);
    }
  }

  function restart() {
    if (shareImage) URL.revokeObjectURL(shareImage.url);
    setShareImage(null);
    setEffort(null);
    setBlush(null);
    setBlushNote("");
    setPickLip(null); setPickBlush(null); setMyLook("");
    setHair({}); setHairMode("ref"); setUseHair(true); setHairNote("");
    setDyeTries({}); setDyeFamily(null); setPickDye(null);
    setBrowTries({}); setBrowFamilyKey(null); setPickBrow(null); setTab("photos");
    setStage("upload"); setStart(null); setLipsOnly(""); setTarget(null); setCards([]); setShowFull(false); setCompare(false); setError(""); setStatus("");
  }

  const demo = config?.demo;
  // AI-generated look photos keep their "synthetic-…" filename from `npm run week1 -- looks`.
  const lookIsAi = !!look && sourceFromFilename(look.name) === "synthetic";
  const photosReady = !!(selfie && look && selfieCheck && lookCheck && !photoProblem(selfieCheck) && !photoProblem(lookCheck));
  const canStart = demo ? config?.demoReady : photosReady && lookConsent;
  const best = bestBuy(cards, undefined, target?.hex);
  const cartTotal = cart.reduce((s, p) => s + p.price, 0);
  const cartKept = keptTotal(cart);
  const lipPick = cards.find((c) => c.product.id === pickLip) ?? best;
  const blushPick = blush ? (blush.cards.find((c) => c.product.id === pickBlush) ?? bestBlush(blush.cards)) : undefined;
  // "Your look": your photo (or the look's hairstyle on it) + the chosen lipstick's lips + the chosen blush's cheeks.
  // Combined in the browser, no extra try-ons.
  const lipPickId = lipPick?.product.id, blushPickId = blushPick?.product.id;
  // Hair dyes go on the look's hairstyle when it's shown, otherwise on your own hair.
  const dyeBase: HairBase = useHair && hair[hairMode] ? hairMode : "none";
  const dyeTry = dyeFamily ? dyeTries[`${dyeBase}:${dyeFamily}`] : undefined;
  const dyePick = [dyeTry?.premium, dyeTry?.budget].find((v) => v && v.product.id === pickDye);
  const hairImage = dyePick?.image ?? (useHair ? hair[hairMode] : undefined);
  const browTry = browFamilyKey ? browTries[browFamilyKey] : undefined;
  const browPick = [browTry?.premium, browTry?.budget].find((v) => v && v.product.id === pickBrow);
  const browImage = browPick?.image;
  // What is still being applied (try-on running, or the picture being recombined), so "Your look" never looks final too early.
  const applying =
    hairBusy ? "the hairstyle"
    : dyeBusy ? `${HAIR_FAMILIES.find((f) => f.key === dyeFamily)?.shade ?? "the"} hair color`
    : browBusy ? `${BROW_FAMILIES.find((f) => f.key === browFamilyKey)?.shade ?? "the"} brows`
    : blushBusy ? "the blush"
    : lookUpdating ? "my picks to the picture"
    : "";
  const browAdvice = dyePick && dyeTry?.before && dyeTry.colors?.[dyePick.product.id] ? adviseBrows(dyeTry.before, dyeTry.colors[dyePick.product.id]) : null;
  useEffect(() => {
    let cancelled = false;
    const lipCard = cards.find((c) => c.product.id === lipPickId);
    const lipImg = lipCard?.image, lipRaw = lipCard?.raw;
    const blushRaw = blush?.cards.find((c) => c.product.id === blushPickId)?.raw;
    if (!start || !lipImg) { setMyLook(""); return; }
    setLookUpdating(true);
    (async () => {
      try {
        const { browsOnlyComposite, cheeksOnlyComposite, deltaComposite, lipsOnlyComposite, toBitmap } = await detect();
        const lipBmp = await toBitmap(lipImg);
        const jpeg = (c: HTMLCanvasElement) => c.toDataURL("image/jpeg", 0.9);
        let url = lipImg, note = "";
        if (hairImage) {
          const hairBmp = await toBitmap(hairImage);
          if (Math.abs(hairBmp.width / hairBmp.height - lipBmp.width / lipBmp.height) > 0.03) {
            // Framed differently from your selfie: the lips/cheeks wouldn't line up, so show the hairstyle on its own.
            note = "The hairstyle came back framed differently, so it's shown without my lipstick and blush.";
            url = hairImage;
          } else {
            url = jpeg(await lipsOnlyComposite(hairBmp, lipBmp));
          }
        }
        // Brows and blush: add only what the product changed vs the lipstick try-on (same YouCam brightening),
        // so no brighter skin or old background is pasted in. Older sessions without the raw try-on copy pixels.
        const refBmp = lipRaw ? await toBitmap(lipRaw) : null;
        if (browImage && !note) {
          url = jpeg(refBmp ? await deltaComposite(await toBitmap(url), refBmp, await toBitmap(browImage), "brows") : await browsOnlyComposite(await toBitmap(url), await toBitmap(browImage)));
        }
        if (blushRaw && !note) {
          url = jpeg(refBmp ? await deltaComposite(await toBitmap(url), refBmp, await toBitmap(blushRaw), "cheeks") : await cheeksOnlyComposite(await toBitmap(url), await toBitmap(blushRaw)));
        }
        if (!cancelled) { setMyLook(url); setHairNote(note); }
      } catch {
        if (!cancelled) setMyLook(lipImg);
      } finally {
        if (!cancelled) setLookUpdating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [start, cards, blush, lipPickId, blushPickId, hairImage, browImage]);

  /** Tries a brow shade's premium gel and budget pencil on your brows and checks whether they look the same. */
  async function tryBrow(family: string) {
    if (!start) return;
    setBrowFamilyKey(family);
    if (browTries[family]) { setPickBrow(browTries[family].budget?.product.id ?? browTries[family].premium.product.id); return; }
    const fam = browFamily(family);
    if (!fam) return;
    setError("");
    setBrowBusy(true);
    const stop = tickStatus(setStatus, `Trying ${fam.premium.shade} on my brows…`);
    try {
      const json = await fetchJson("/api/look/brows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: start.fileId, productIds: [fam.premium.id, fam.budget.id] }),
      }, 120_000);
      const results = json.results as { productId: string; image?: string; error?: string }[];
      const img = (id: string) => results.find((r) => r.productId === id)?.image;
      const pImg = img(fam.premium.id), bImg = img(fam.budget.id);
      if (!pImg) throw new Error(results.find((r) => r.error)?.error ?? "The brow try-on didn't work. Please try again.");
      const { browCrop, pixelsOf } = await detect();
      // "Natural" close-up from a lipstick try-on: same YouCam lighting as the brow try-ons, brows untouched.
      const naturalSrc = cards.find((c) => c.product.id === lipPick?.product.id)?.raw ?? start.selfieImage;
      const [natural, pCrop, bCrop] = await Promise.all([browCrop(naturalSrc), browCrop(pImg), bImg ? browCrop(bImg) : undefined]);
      const entry: BrowTry = { premium: { product: fam.premium, image: pImg, crop: pCrop }, natural };
      if (bImg) {
        entry.budget = { product: fam.budget, image: bImg, crop: bCrop };
        const p = await pixelsOf(pImg), b = await pixelsOf(bImg, p.width, p.height);
        // Base = a lipstick try-on (same YouCam brightening as the brow try-ons), so only the brows count as changed.
        const m = measureDyedHair(await pixelsOf(naturalSrc, p.width, p.height), [p, b], { changed: 18, minCoverage: 0.0005 });
        if (m.reliable) entry.dupe = hairDupe(m.colors[0], m.colors[1]);
        else entry.note = "This shade is too close to my natural brows to compare the two versions reliably.";
      }
      setBrowTries((t) => ({ ...t, [family]: entry }));
      setPickBrow((entry.budget ?? entry.premium).product.id);
      setStatus(entry.dupe ? `${fam.premium.shade} brows: the $${fam.budget.price} pencil ${entry.dupe.label} vs the $${fam.premium.price} gel.` : "Brows on point ✨ Added to my look.");
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
    } finally {
      stop();
      setBrowBusy(false);
    }
  }

  /** Tries a shade's salon and budget dyes on the current base and checks whether they look the same on the hair. */
  async function tryDye(family: string) {
    if (!start) return;
    setDyeFamily(family);
    const key = `${dyeBase}:${family}`;
    if (dyeTries[key]) { setPickDye(dyeTries[key].budget?.product.id ?? dyeTries[key].premium.product.id); return; }
    const fam = hairFamily(family);
    if (!fam) return;
    setError("");
    setDyeBusy(true);
    const stop = tickStatus(setStatus, `Trying ${fam.premium.shade} hair color on me, salon and everyday versions…`);
    try {
      const json = await fetchJson("/api/look/haircolor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: start.fileId, lookFileId: start.lookFileId, base: dyeBase, productIds: [fam.premium.id, fam.budget.id] }),
      }, 180_000);
      const results = json.results as { productId: string; image?: string; error?: string }[];
      const img = (id: string) => results.find((r) => r.productId === id)?.image;
      const pImg = img(fam.premium.id), bImg = img(fam.budget.id);
      if (!pImg) throw new Error(results.find((r) => r.error)?.error ?? "The hair color try-on didn't work. Please try again.");
      const entry: DyeTry = { premium: { product: fam.premium, image: pImg } };
      if (bImg) {
        entry.budget = { product: fam.budget, image: bImg };
        const { pixelsOf } = await detect();
        const p = await pixelsOf(pImg), b = await pixelsOf(bImg, p.width, p.height);
        const base = await pixelsOf(dyeBase === "none" ? start.selfieImage : hair[dyeBase as "ref" | "src"]!, p.width, p.height);
        const m = measureDyedHair(base, [p, b]);
        if (m.reliable) {
          entry.dupe = hairDupe(m.colors[0], m.colors[1]);
          entry.before = m.baseColor;
          entry.colors = { [fam.premium.id]: m.colors[0], [fam.budget.id]: m.colors[1] };
        }
        else entry.note = "This color is too close to the current hair to compare the two versions reliably.";
      }
      setDyeTries((t) => ({ ...t, [key]: entry }));
      setPickDye((entry.budget ?? entry.premium).product.id);
      setStatus(entry.dupe ? `${fam.premium.shade}: the $${fam.budget.price} box dye ${entry.dupe.label} vs the $${fam.premium.price} salon color.` : "Hair color added to my look. Obsessed 😍");
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
    } finally {
      stop();
      setDyeBusy(false);
    }
  }

  async function addHair(mode: "ref" | "src") {
    if (!start) return;
    setHairMode(mode);
    setUseHair(true);
    if (hair[mode]) return;
    setError("");
    setHairBusy(true);
    const stop = tickStatus(setStatus, "Trying the look's hairstyle on me…");
    try {
      const json = await fetchJson("/api/look/hair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: start.fileId, lookFileId: start.lookFileId, color: mode }),
      }, 180_000);
      setHair((h) => ({ ...h, [mode]: json.image as string }));
      setStatus("New hair, who dis? 💇‍♀️ Added to my look.");
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
    } finally {
      stop();
      setHairBusy(false);
    }
  }

  // Shown above both lipstick and blush results; one shared setting.
  const viewSwitch = (
    <div className="view-switch" role="group" aria-label="How to show results">
      <button aria-pressed={view === "closeup"} onClick={() => setView("closeup")}>Close-ups (check the match)</button>
      <button aria-pressed={view === "full"} onClick={() => setView("full")}>Full face (see the look)</button>
    </div>
  );

  return (
    <main className="wide">
      <header className="brand-header">
        {/* Name and tagline in one: "Pretty‸looks Smart‸picks.", like a handwritten edit. */}
        <h1 className="brand" aria-label="Pretty Smart: Pretty looks. Smart picks.">
          <span className="brand-word">Pretty<span className="brand-insert" aria-hidden="true"><span className="brand-ins-word">looks</span><span className="brand-caret">‸</span></span></span>
          {" "}
          <span className="brand-word"><em>Smart</em><span className="brand-insert" aria-hidden="true"><span className="brand-ins-word">picks.</span><span className="brand-caret">‸</span></span></span>
        </h1>
        {/* One personal line: the greeting and the invitation to play, with the name when we have one. */}
        <p className="tagline greeting">
          Hey {firstName || "you"}, gorgeous is a given! 😉 Ready to turn up the glam with a brand-new shade? 💋
        </p>
        {/* Like a "log out" link, top right: switch to someone else's name. */}
        {firstName && !editingName && (
          <button className="switch-name" onClick={() => { setNameDraft(firstName); setEditingName(true); }}>
            Not {firstName}? Switch ↪
          </button>
        )}
        {(editingName || (!firstName && !start)) && (
          <div className="greeting-row">
            <form
              className="name-form"
              onSubmit={(e) => {
                e.preventDefault();
                const name = cleanFirstName(nameDraft);
                setFirstName(name);
                saveFirstName(name);
                setEditingName(false);
              }}
            >
              <label>
                What do your besties call you? 💕 <span className="hint">(just for the greetings, and it never leaves this browser)</span>{" "}
                <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={MAX_NAME_LENGTH} autoComplete="given-name" placeholder="Your first name" />
              </label>{" "}
              <button type="submit">{nameDraft.trim() ? "That's me ✨" : firstName ? "Remove my name" : "That's me ✨"}</button>
            </form>
          </div>
        )}
      </header>

      {demo && config?.demoReady && (
        <p className="banner" role="note">
          Demo mode: replaying a real recorded session. No photos are uploaded.
        </p>
      )}
      {demo && !config?.demoReady && (
        <p className="banner" role="alert">
          Demo mode is on, but no session has been recorded yet. To record one, set <code>DEMO_MODE=0</code> and{" "}
          <code>RECORD_DEMO=1</code> in <code>.env.local</code>, restart <code>npm run dev</code>, and run the flow once.
        </p>
      )}

      <div role="status" aria-live="polite" className="status">{status}</div>
      {error && <p role="alert" className="error">{error}</p>}

      {start && (
        <nav className="tabs" role="tablist" aria-label="Steps">
          {([
            ["photos", "📸 Me", true],
            ["lipstick", "💄 Lips", cards.length > 0],
            ["blush", "🌸 Cheeks", cards.length > 0],
            ["hair", "💇‍♀️ Hair & brows", cards.length > 0],
            ["look", `✨ My glow-up${cart.length ? ` · cart (${cart.length})` : ""}${applying ? " …" : ""}`, cards.length > 0],
          ] as [Tab, string, boolean][]).map(([key, text, enabled]) => (
            <button key={key} role="tab" aria-selected={tab === key} disabled={!enabled} onClick={() => setTab(key)}>{text}</button>
          ))}
        </nav>
      )}
      {cartKept > 0 && <p className="kept-counter" role="status">💰 My beauty kitty: <strong>${cartKept}</strong> saved so far. Same gorgeous looks, smarter picks.</p>}

      {tab === "photos" && (
        <>
      {/* 1. Upload */}
      <section className="panel" aria-labelledby="s1">
        <h2 id="s1">Me + the look I love</h2>
        {demo ? (
          <p>The demo uses the recorded selfie and look. Press <strong>💋 Let&apos;s Try This Look!</strong>.</p>
        ) : (
          <>
            <div className="pickers">
              <PhotoPicker title="Your selfie" hint="Front-facing • No glasses • Light or bare lips • Good lighting" file={selfie} check={selfieCheck} onPick={(f) => onPick("selfie", f)} disabled={stage !== "upload"} />
              <PhotoPicker title="The look you're crushing on ✨" hint="Your photo, a friend's photo, or any look you have permission to use. One face, lips clearly visible." file={look} check={lookCheck} onPick={(f) => onPick("look", f)} disabled={stage !== "upload"} />
            </div>
            <p className="hint" id="photo-privacy">
              🔒 Photos are processed by YouCam, which keeps them for up to 24 hours. This app doesn&apos;t save them.
            </p>
            <label className="toggle consent">
              <input
                type="checkbox"
                checked={lookConsent}
                onChange={(e) => setLookConsent(e.target.checked)}
                disabled={stage !== "upload"}
                aria-describedby={lookIsAi ? "photo-privacy ai-note" : "photo-privacy"}
              />
              {lookIsAi
                ? <>AI-generated with YouCam; I&apos;m happy to use it.</>
                : <>It&apos;s my photo, or I have permission to use it.</>}
              {/* Transparency note as a small info tip (hover or keyboard focus), so it doesn't clutter the flow. */}
              {lookIsAi && (
                <span className="info-tip" tabIndex={0} role="note" aria-label="About AI-generated looks" onClick={(e) => e.preventDefault()}>
                  ⓘ<span className="info-tip-text" id="ai-note">AI-generated look: labeled as AI-generated wherever it&apos;s shown.</span>
                </span>
              )}
            </label>
            {photosReady && !lookConsent && <p className="hint">Tick the permission box to continue.</p>}
          </>
        )}
        <button className="big primary" onClick={seeItOnMe} disabled={!canStart || stage !== "upload"}>
          {stage === "transferring" ? "✨ Recreating Your Look…" : start ? "😍 Love My New Look!" : "💋 Let's Try This Look!"}
        </button>
      </section>

      {/* 2. See it on you */}
      {start && (
        <section className="panel" aria-labelledby="s2">
          <h2 id="s2">Okayyy, look at me! 😍</h2>
          <div className="look-on-me">
            <figure>
              {(() => {
                const after = showFull ? start.transferImage : lipsOnly;
                const afterAlt = showFull ? "My photo with the full makeup look applied" : "My photo with only the lip color from the look applied";
                return compare ? (
                  <div className="before-after">
                    {[{ src: start.selfieImage, alt: "My original selfie", label: "Before" }, { src: after, alt: afterAlt, label: "After" }].map((v) => (
                      <div key={v.label} className="look-frame">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="look-bg" src={v.src} alt="" aria-hidden="true" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="look-main" src={v.src} alt={v.alt} />
                        <span className="frame-label">{v.label}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="look-frame">
                    {/* Blurred copy of the same picture behind it, so the photo stands out. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="look-bg" src={after} alt="" aria-hidden="true" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="look-main" src={after} alt={afterAlt} />
                  </div>
                );
              })()}
            </figure>
            {target && (
              <div className="lip-card" aria-label="My new lip look">
                <span className="lip-swatch" style={{ background: target.hex }} aria-hidden />
                <div>
                  <p className="lip-card-title">💋 My new lip look</p>
                  <p className="lip-card-name">
                    {cap(colorName(target.hex))}{lookCheck && <> · {cap(lookCheck.finish)} finish</>}
                  </p>
                  <p className="hint">{target.hex}</p>
                </div>
              </div>
            )}
            <div className="look-actions">
              <button className="secondary" aria-pressed={compare} onClick={() => setCompare((c) => !c)}>
                ↔️ {compare ? "Back to my new look" : "Compare before & after"}
              </button>
              <label className="toggle">
                <input type="checkbox" checked={showFull} onChange={(e) => setShowFull(e.target.checked)} /> Show the full makeup ✨
              </label>
              <button className="secondary small" onClick={restart}>📸 Start over</button>
            </div>
            <p className="hint">{showFull ? "Eyes, cheeks and lips from the look photo." : "Just the lip color from the look photo: that's what we'll match."}</p>
          </div>
          {stage === "preview" || stage === "trying" ? (
            <button className="big primary" onClick={findForLess} disabled={stage === "trying"}>
              {stage === "trying" ? "Swatching shades on me… 💋" : "Find my perfect shade 💄"}
            </button>
          ) : null}
          {profile && profileKey && (
            <p className="profile-note">
              <span>
                <strong>💋 My lip profile is ready!</strong> Calibrated from {profile.looks} earlier look{profile.looks > 1 ? "s" : ""}, so my
                first try-ons already fit my lips. It stays in this browser (numbers only, no photo).
              </span>
              <button
                className="secondary small"
                onClick={() => { forgetProfile(profileKey); setProfile(null); setStatus("Lip profile reset in this browser."); }}
                disabled={stage === "trying"}
              >
                Reset profile
              </button>
            </p>
          )}
        </section>
      )}

        </>
      )}

      {tab === "lipstick" && (
        <>
      {/* 3 + 4. Proof */}
      {cards.length > 0 && (
        <section className="panel" aria-labelledby="s3">
          <h2 id="s3" tabIndex={-1} ref={resultsRef}>My lips, my shades 💋</h2>
          {viewSwitch}
          {effort && (
            <p className="effort">
              Found in <strong>{effort.rounds} round{effort.rounds > 1 ? "s" : ""}</strong> · {effort.tryOns} try-ons
              {effort.usedProfile ? " · using my lip profile" : ""}
            </p>
          )}
          {best && (
            <p className="best">
              <strong>Made for me 💖</strong> {label(best.product)}: {best.score}% match to the look, <strong>${best.product.price}</strong>
              {best.savings ? <>. <strong className="kept">${best.savings} saved</strong> into my kitty 💰</> : null}.
              {target && <><br /><span className="why">{whyText(target.hex, best, lookCheck?.finish)}</span></>}
            </p>
          )}
          {best && (
            <div className="share">
              {!shareImage ? (
                <button onClick={makeShareCard}>Show off my look ✨</button>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shareImage.url} alt={`Result card: ${shareImage.caption}`} className="share-preview" />
                  <div className="actions">
                    <a className="button-like" href={shareImage.url} download="pretty-smart.png">Download image</a>
                    <button onClick={shareCard}>Share…</button>
                    <button onClick={() => navigator.clipboard.writeText(shareImage.caption).then(() => setStatus("Caption copied."))}>Copy caption</button>
                  </div>
                  <p className="hint">Only the lip close-ups are shown, not my whole face. Caption: &ldquo;{shareImage.caption}&rdquo;</p>
                </>
              )}
            </div>
          )}
          {(() => {
            const groups = groupByFamily(cards);
            const strong = groups.filter((g) => !g.weak), weak = groups.filter((g) => g.weak);
            const render = (g: (typeof groups)[number]) => (
              <ShadeGroupCard key={g.family} group={g} targetCrop={view === "full" ? lipsOnly : target?.lipCrop} full={view === "full"} targetHex={target?.hex} lookFinish={lookCheck?.finish} bestId={best?.product.id} onAdd={addToCart} inCart={inCart} pickedId={lipPick?.product.id} onPick={setPickLip} />
            );
            return (
              <>
                <ol className="groups">{(strong.length ? strong : groups.slice(0, 1)).map(render)}</ol>
                {strong.length > 0 && weak.length > 0 && (
                  <details className="more">
                    <summary>Show other shades tried ({weak.length})</summary>
                    <ol className="groups">{weak.map(render)}</ol>
                  </details>
                )}
              </>
            );
          })()}
          <p className="hint">Match % compares each shade on my lips with the look on my lips (CIEDE2000 color difference). Under 4 looks the same to most people.</p>
          <button className="big" onClick={() => setTab("blush")}>Next: a little blush 🌸 →</button>
        </section>
      )}

        </>
      )}

      {tab === "blush" && (
        <>
      {blush && (
        <section className="panel" aria-labelledby="sb">
          <h2 id="sb">My cheeks, my glow 🌸</h2>
          {viewSwitch}
          <p className="effort">Found with {blush.tryOns} blush try-ons · calibrated to how blush shows on my cheeks</p>
          {(() => {
            const b = bestBlush(blush.cards);
            return b ? (
              <p className="best">
                <strong>My glow 💖</strong> {label(b.product)}: {b.score}% match to the look, <strong>${b.product.price}</strong>
                {b.savings ? <>. <strong className="kept">${b.savings} saved</strong> into my kitty 💰</> : null}.
              </p>
            ) : null;
          })()}
          <ol className="groups">
            {(() => {
              const best = bestBlush(blush.cards);
              const byFamily = new Map<string, typeof blush.cards>();
              for (const c of blush.cards) byFamily.set(c.product.family, [...(byFamily.get(c.product.family) ?? []), c]);
              return [...byFamily.values()]
                .sort((x, y) => Math.min(...x.map((c) => c.diff)) - Math.min(...y.map((c) => c.diff)))
                .map((variants) => {
                  const family = variants[0].product.family;
                  const hasBest = variants.some((c) => c.product.id === best?.product.id);
                  return (
                    <li key={family} className={`group ${hasBest ? "is-best" : ""}`}>
                      <article aria-labelledby={`blush-${family}`}>
                        <header className="group-head">
                          <h3 id={`blush-${family}`}>{variants[0].product.shade}</h3>
                        </header>
                        <div className="variants">
                          {blush.targetCrop && (
                            <figure className="variant target">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={view === "full" ? blush.targetFull : blush.targetCrop} className={view === "full" ? "full" : ""} alt={view === "full" ? "My bare face with only the look's blush added" : "The look's blush on my bare cheeks"} />
                              <figcaption>The look&apos;s blush on my bare skin</figcaption>
                            </figure>
                          )}
                          {[...variants].sort((x, y) => y.product.price - x.product.price).map((c) => (
                            <figure key={c.product.id} className={`variant ${c.product.id === best?.product.id ? "is-best" : ""}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {(view === "full" ? c.image : c.crop) && <img src={view === "full" ? c.image : c.crop} className={view === "full" ? "full" : ""} alt={`${label(c.product)} on my ${view === "full" ? "face" : "cheeks"}`} />}
                              <figcaption>
                                {c.product.id === best?.product.id && <span className="tag best-tag">Smart pick</span>}
                                <span className="card-brand">{c.product.name}</span>
                                <span className="price">${c.product.price}</span>
                                <span><span className="score">{c.score}%</span> match · {c.verdict}</span>
                                <span className="hint">{c.product.texture} finish · tint difference {c.diff}</span>
                                {c.dupe && (
                                  <span className={c.dupe.isTrueDupe ? "dupe-ok" : "dupe-no"}>
                                    {c.dupe.isTrueDupe
                                      ? `✓ Just as gorgeous on me as the $${c.product.price + (c.savings ?? 0)} splurge 💅 · $${c.savings} saved 💰`
                                      : `✗ Not quite the same on me: the ${getBlush(c.dupe.premiumId)?.name ?? "splurge version"} is worth the splurge here 💖`}
                                  </span>
                                )}
                                <button onClick={() => addToCart(c.product)} disabled={inCart(c.product.id)} aria-label={inCart(c.product.id) ? `${label(c.product)} is in my cart` : `Add ${label(c.product)}, $${c.product.price}, to cart`}>
                                  {inCart(c.product.id) ? "✓ In cart" : "Add to cart"}
                                </button>
                                <button className="pick" aria-pressed={c.product.id === blushPick?.product.id} onClick={() => setPickBlush(c.product.id)}>
                                  {c.product.id === blushPick?.product.id ? "✓ In my look" : "Use in my look"}
                                </button>
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                      </article>
                    </li>
                  );
                });
            })()}
          </ol>
          <p className="hint">
            Blush is compared as the color it adds to your cheeks (against your forehead in the same photo), so the look&apos;s foundation
            doesn&apos;t count. The first picture shows only the look&apos;s blush, added to your bare cheeks, so all pictures share the same skin.
            Differences are smaller than for lipstick, so blush uses its own scale: under 2.5 looks the same.
          </p>
          <button className="big" onClick={() => setTab("hair")}>Next: hair &amp; brows 💇‍♀️ →</button>
        </section>
      )}

        </>
      )}
      {tab === "blush" && !blush && (
        <section className="panel" aria-labelledby="sbc">
          <h2 id="sbc">A little blush 🌸</h2>
          <p>That flush in the look? Let&apos;s get it on my cheeks. We measure the color the blush adds and prove the closest shades on me.</p>
          <div className="blush-cta">
            {!blush && !blushNote && (
              <button className="big" onClick={matchBlush} disabled={blushBusy || (config?.demo && !(config.demoBlush ?? []).length)}>
                {blushBusy ? "Finding my glow… 🌸" : "Match my blush 🌸"}
              </button>
            )}
            {config?.demo && !(config.demoBlush ?? []).length && !blush && (
              <p className="hint">Blush isn&apos;t in the recorded demo yet. Record a live session with blush to include it.</p>
            )}
            {blushNote && <p role="status">{blushNote}</p>}
          </div>
        </section>
      )}
      {tab === "hair" && (
        <section className="panel" aria-labelledby="sh">
          <h2 id="sh">Hair &amp; brows 💇‍♀️</h2>
          <div className="hair-layout">
          {myLook && (
            <figure className="hair-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={myLook} alt="My look with the current hair, brow, lipstick and blush picks" />
              <figcaption>My look so far: updates as I pick. Only the hair and brow color change; my brow shape stays mine.</figcaption>
            </figure>
          )}
          <div className="hair-box" role="group" aria-labelledby="hair-h">
            <h3 id="hair-h">1. Give me this hair 💁‍♀️</h3>
            <p className="hint">Copies the hairstyle and hair color from the look photo onto me. Works best when my photo shows my shoulders and my hair is loose.</p>
            {config?.demo && !(config.demoHair ?? []).includes("ref") ? (
              <p className="hint">The recorded demo has no hairstyle yet.</p>
            ) : (
              <div className="view-switch">
                <button aria-pressed={useHair && !!hair.ref} disabled={hairBusy} onClick={() => addHair("ref")}>The look&apos;s hairstyle</button>
                <button aria-pressed={!useHair || !hair.ref} onClick={() => setUseHair(false)}>My own hair</button>
              </div>
            )}
            {hairBusy && <p role="status">Trying the hairstyle on me… (about 20–60 seconds)</p>}
            {hairNote && <p className="hint">{hairNote}</p>}

            <h3>2. Feeling bold? Try a new hair color</h3>
            <p className="hint">
              On {dyeBase === "none" ? "my own hair" : "the look's hairstyle"}. We try the salon color and the everyday box dye on me and check whether they look the same.
            </p>
            <div className="dye-swatches">
              <button aria-pressed={!pickDye || !dyePick} onClick={() => { setPickDye(null); setDyeFamily(null); }}>
                {dyeBase === "none" ? "My hair color" : "The look's color"}
              </button>
              {HAIR_FAMILIES.filter((f) => {
                if (!config?.demo) return true;
                const rec = config.demoHairColor?.[dyeBase] ?? [];
                const fam = hairFamily(f.key);
                return !!fam && rec.includes(fam.premium.id);
              }).map((f) => (
                <button key={f.key} aria-pressed={dyeFamily === f.key && !!dyePick} disabled={dyeBusy} onClick={() => tryDye(f.key)}>
                  <span className="swatch" style={{ background: f.hex }} aria-hidden /> {f.shade}
                </button>
              ))}
            </div>
            {dyeBusy && <p role="status">Trying the hair color on me… (about 10–30 seconds)</p>}
            {dyeTry && (
              <div className="variants dye-variants">
                {[dyeTry.premium, dyeTry.budget].filter((v): v is NonNullable<typeof v> => !!v).map((v) => (
                  <figure key={v.product.id} className={`variant ${v.product.id === pickDye ? "is-best" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.image} className="full" alt={`${label(v.product)} hair color on me`} />
                    <figcaption>
                      <span className="card-brand">{v.product.name}</span>
                      <span className="price">${v.product.price}</span>
                      {v === dyeTry.budget && dyeTry.dupe && (
                        <span className={dyeTry.dupe.isTrueDupe ? "dupe-ok" : "dupe-no"}>
                          {dyeTry.dupe.isTrueDupe
                            ? `✓ Just as gorgeous on me as the $${dyeTry.premium.product.price} salon color 💅 · $${dyeTry.premium.product.price - v.product.price} saved 💰`
                            : `✗ Not quite the same on me: the ${dyeTry.premium.product.name} is worth the splurge here 💖`}
                        </span>
                      )}
                      {v === dyeTry.budget && dyeTry.dupe && <span className="hint">hair color difference {dyeTry.dupe.deltaE}</span>}
                      {v === dyeTry.budget && dyeTry.note && <span className="hint">{dyeTry.note}</span>}
                      <button className="pick" aria-pressed={v.product.id === pickDye} onClick={() => setPickDye(v.product.id)}>
                        {v.product.id === pickDye ? "✓ In my look" : "Use in my look"}
                      </button>
                      <button onClick={() => addToCart(v.product)} disabled={inCart(v.product.id)}>{inCart(v.product.id) ? "✓ In cart" : "Add to cart"}</button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
                      <h3>3. Brows to match ✨</h3>
            {browAdvice ? (
              <p className={browAdvice.needed ? "best" : "hint"}>
                {browAdvice.needed && <strong>Suggested: {browAdvice.shade}. </strong>}{browAdvice.reason}
              </p>
            ) : (
              <p className="hint">Brows usually stay as they are unless the hair color changes a lot. Pick a hair color above for a suggestion, or try a brow shade anyway.</p>
            )}
            <div className="dye-swatches">
              <button aria-pressed={!browPick} onClick={() => { setPickBrow(null); setBrowFamilyKey(null); }}>My natural brows</button>
              {BROW_FAMILIES.filter((f) => !config?.demo || (config.demoBrows ?? []).includes(browFamily(f.key)?.premium.id ?? "")).map((f) => (
                <button key={f.key} aria-pressed={browFamilyKey === f.key && !!browPick} disabled={browBusy} onClick={() => tryBrow(f.key)}>
                  <span className="swatch" style={{ background: f.hex }} aria-hidden /> {f.shade}{browAdvice?.family === f.key ? " ★" : ""}
                </button>
              ))}
            </div>
            {browAdvice && <p className="hint">★ = suggested for my new hair color.</p>}
            {browBusy && <p role="status">Trying the brow color on me… (about 10–20 seconds)</p>}
            {browTry && (
              <div className="variants brow-variants">
                {browTry.natural && (
                  <figure className="variant target">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={browTry.natural} alt="My natural brows" />
                    <figcaption>My natural brows</figcaption>
                  </figure>
                )}
                {[browTry.premium, browTry.budget].filter((v): v is NonNullable<typeof v> => !!v).map((v) => (
                  <figure key={v.product.id} className={`variant ${v.product.id === pickBrow ? "is-best" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {v.crop && <img src={v.crop} alt={`${label(v.product)} on my brows`} />}
                    <figcaption>
                      <span className="card-brand">{v.product.name}</span>
                      <span className="price">${v.product.price}</span>
                      {v === browTry.budget && browTry.dupe && (
                        <span className={browTry.dupe.isTrueDupe ? "dupe-ok" : "dupe-no"}>
                          {browTry.dupe.isTrueDupe
                            ? `✓ Just as gorgeous on my brows as the $${browTry.premium.product.price} gel 💅 · $${browTry.premium.product.price - v.product.price} saved 💰`
                            : `✗ Not quite the same on me: the ${browTry.premium.product.name} is worth the splurge here 💖`}
                        </span>
                      )}
                      {v === browTry.budget && browTry.note && <span className="hint">{browTry.note}</span>}
                      <button className="pick" aria-pressed={v.product.id === pickBrow} onClick={() => setPickBrow(v.product.id)}>
                        {v.product.id === pickBrow ? "✓ In my look" : "Use in my look"}
                      </button>
                      <button onClick={() => addToCart(v.product)} disabled={inCart(v.product.id)}>{inCart(v.product.id) ? "✓ In cart" : "Add to cart"}</button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
          </div>
          <button className="big" onClick={() => setTab("look")}>Next: my glow-up ✨ →</button>
        </section>
      )}

      {tab === "look" && (
        <>
      {/* Your look: chosen lipstick + blush together */}
      {start && myLook && lipPick && (
        <section className="panel" aria-labelledby="sl">
          <h2 id="sl">My glow-up ✨</h2>
          <p className="greeting">Gorgeous{firstName ? `, ${firstName}` : ""}! Here&apos;s my glow-up ✨</p>
          {(() => {
            const items: CartItem[] = [lipPick.product, ...(blushPick ? [blushPick.product] : []), ...(dyePick ? [dyePick.product] : []), ...(browPick ? [browPick.product] : [])];
            const lookSrc = start.lookImage ?? lookUrl;
            return lookSrc ? (
              <Twinning
                lookSrc={lookSrc}
                mySrc={myLook}
                kept={keptTotal(items)}
                firstName={firstName}
                lookLabel={start.lookSynthetic || lookIsAi ? "AI-generated look" : "The look"}
                onLove={() => {
                  const b = document.getElementById("get-my-look");
                  b?.scrollIntoView({ behavior: "smooth", block: "center" });
                  b?.focus({ preventScroll: true });
                }}
                onTweak={(t) => setTab(t)}
              />
            ) : null;
          })()}
          <p className="picks-line">
            My picks: <strong>{label(lipPick.product)}</strong> ${lipPick.product.price}
            {blushPick && <> + <strong>{label(blushPick.product)}</strong> ${blushPick.product.price}</>}
            {dyePick && <> + <strong>{label(dyePick.product)}</strong> ${dyePick.product.price}</>}
            {browPick && <> + <strong>{label(browPick.product)}</strong> ${browPick.product.price}</>}
          </p>
          <details className="more">
            <summary>Compare the full look on me with my picks</summary>
          <div className="compare">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={start.transferImage} alt="My photo with the full makeup look I loved" />
              <figcaption>The look I fell for</figcaption>
            </figure>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={myLook} alt={`My photo wearing ${label(lipPick.product)}${blushPick ? ` and ${label(blushPick.product)}` : ""}${hairImage ? ", with the look's hairstyle" : ""}${browPick ? ` and ${browPick.product.shade} brows` : ""}`} />
              <figcaption>
                My picks: <strong>{label(lipPick.product)}</strong> ${lipPick.product.price}
                {blushPick && <> + <strong>{label(blushPick.product)}</strong> ${blushPick.product.price}</>}
                {dyePick && <> + <strong>{label(dyePick.product)}</strong> ${dyePick.product.price}</>}
                {browPick && <> + <strong>{label(browPick.product)}</strong> ${browPick.product.price}</>}
                {" "}= <strong>${lipPick.product.price + (blushPick?.product.price ?? 0) + (dyePick?.product.price ?? 0) + (browPick?.product.price ?? 0)}</strong>
              </figcaption>
            </figure>
          </div>
          </details>
          <p className="hint">
            Change a pick with &quot;Use in my look&quot; in the Lipstick, Blush and Hair &amp; brows tabs. Combined on my own photo, no extra try-ons.
          </p>
          {applying && (
            <p className="banner" role="status">
              Still applying {applying}… the picture and total will update in a few seconds.
            </p>
          )}
          {(() => {
            const items: CartItem[] = [lipPick.product, ...(blushPick ? [blushPick.product] : []), ...(dyePick ? [dyePick.product] : []), ...(browPick ? [browPick.product] : [])];
            const all = items.every((i) => inCart(i.id));
            return (
              <button id="get-my-look" className="big primary" onClick={() => addToCart(...items)} disabled={all || !!applying}>
                {applying ? "Wait: still applying…" : all ? "✓ In my beauty bag" : `Get my look 🛍️ · $${items.reduce((t, i) => t + i.price, 0)}${keptTotal(items) ? ` · $${keptTotal(items)} saved 💰` : ""}`}
              </button>
            );
          })()}
        </section>
      )}

      {/* Cart */}
      {cart.length > 0 && (
        <section className="panel" aria-labelledby="s5">
          <h2 id="s5">My beauty bag 🛍️</h2>
          <ul>
            {cart.map((p) => (
              <li key={p.id} className="cart-row">
                {label(p)}: ${p.price}
                <button onClick={() => removeFromCart(p.id)} aria-label={`Remove ${label(p)} from cart`}>Remove</button>
              </li>
            ))}
          </ul>
          <p><strong>Total: ${cartTotal}</strong>{cartKept > 0 && <> · <strong className="kept">${cartKept} saved</strong> in my beauty kitty 💰</>}</p>
          <p className="hint">Demo store: no order is placed (your kitty is safe 😉).</p>
        </section>
      )}

        </>
      )}

      {stage !== "upload" && <button onClick={restart}>Start over</button>}
    </main>
  );
}

function PhotoPicker(props: { title: string; hint: string; file: File | null; check: LipResult | null; onPick: (f: File | null) => void; disabled?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!props.file) return setUrl("");
    const u = URL.createObjectURL(props.file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [props.file]);
  const problem = photoProblem(props.check);
  return (
    <div className="picker">
      <h3>{props.title}</h3>
      <p className="hint">{props.hint}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={props.check?.overlay.toDataURL("image/jpeg", 0.8) ?? url} alt={`${props.title} preview with the lip area outlined`} />}
      {props.check && !problem && <p className="ok">✓ Lips found</p>}
      {problem && <p role="alert" className="error">{problem}</p>}
      <label className="button-like">
        {props.file ? "Choose a different photo" : "Choose photo"}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" disabled={props.disabled} onChange={(e) => props.onPick(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  );
}

function ShadeGroupCard({ group, targetCrop, full, targetHex, lookFinish, bestId, onAdd, inCart, pickedId, onPick }: {
  full?: boolean;
  group: ReturnType<typeof groupByFamily<ShadeCard>>[number];
  targetCrop?: string;
  targetHex?: string;
  lookFinish?: Finish;
  bestId?: string;
  onAdd: (p: LipProduct) => void;
  inCart: (id: string) => boolean;
  pickedId?: string;
  onPick: (id: string) => void;
}) {
  const calibrated = group.variants.some((v) => v.calibrated);
  const headingId = `shade-${group.family}`;
  return (
    <li className={`group ${group.variants.some((v) => v.product.id === bestId) ? "is-best" : ""}`}>
      <article aria-labelledby={headingId}>
        <header className="group-head">
          <h3 id={headingId}>{group.shade}</h3>
          {calibrated && <span className="tag" title="Chosen after measuring how colors shift on my lips">Calibrated to my lips</span>}
        </header>
        <div className="variants">
          {targetCrop && (
            <figure className="variant target">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={targetCrop} className={full ? "full" : ""} alt={full ? "My photo with only the look's lip color" : "The look's lip color on me"} />
              <figcaption>The look on me</figcaption>
            </figure>
          )}
          {group.variants.map((c) => {
            const why = targetHex ? whyText(targetHex, c, lookFinish) : null;
            return (
            <figure key={c.product.id} className={`variant ${c.product.id === bestId ? "is-best" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {(full ? c.image : c.crop) && <img src={full ? c.image : c.crop} className={full ? "full" : ""} alt={`${label(c.product)} on my ${full ? "face" : "lips"}. ${why ?? ""}`} />}
              <figcaption>
                {c.product.id === bestId && <span className="tag best-tag">Smart pick</span>}
                <span className="card-brand">{c.product.name}</span>
                <span className="price">${c.product.price}</span>
                <span><span className="score">{c.score}%</span> match · {c.verdict}</span>
                <span className={`finish ${c.finishMatch === false ? "finish-off" : ""}`}>
                  {cap(c.finish)} finish{c.finishMatch === true ? " ✓ same as the look" : c.finishMatch === false ? `, the look is ${lookFinish}` : ""}
                </span>
                {why && <span className="why">{why}</span>}
                {c.tones?.flatter && <span className="why">Flatter than the look: less contrast between the light and dark parts of the lips.</span>}
                <span className="hint">ΔE {c.deltaE}{c.tones ? ` (middle ${c.tones.middle} · light parts ${c.tones.light} · dark parts ${c.tones.dark})` : ""}</span>
                {c.dupe && (
                  <span className={c.dupe.isTrueDupe ? "dupe-ok" : "dupe-no"}>
                    {c.dupe.isTrueDupe
                      ? `✓ Just as gorgeous on me as the $${c.product.price + (c.savings ?? 0)} splurge 💅 · $${c.savings} saved 💰`
                      : `✗ Not quite the same on me: the ${getProduct(c.dupe.premiumId)?.name ?? "splurge version"} is worth the splurge here 💖`}
                  </span>
                )}
                <button onClick={() => onAdd(c.product)} disabled={inCart(c.product.id)} aria-label={inCart(c.product.id) ? `${label(c.product)} is in my cart` : `Add ${label(c.product)}, $${c.product.price}, to cart`}>
                  {inCart(c.product.id) ? "✓ In cart" : "Add to cart"}
                </button>
                <button className="pick" aria-pressed={c.product.id === pickedId} onClick={() => onPick(c.product.id)}>
                  {c.product.id === pickedId ? "✓ In my look" : "Use in my look"}
                </button>
              </figcaption>
            </figure>
            );
          })}
        </div>
      </article>
    </li>
  );
}
