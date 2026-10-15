"use client";
// Steal the Look, for Less (lipstick only).
// 1 Upload → 2 See it on you → 3 Find it for less → 4 Proof → 5 Cart

import { useEffect, useRef, useState } from "react";
import type { LipProduct } from "@/data/catalog";
import type { LipResult } from "@/lib/lips/detect";
import { bestBuy, buildProof, DUPE_DELTA_E, groupByFamily, pickCandidates, refineCandidates, type ProofCard } from "@/lib/lips/plan";
import { deltaE2000 } from "@/lib/color";
import { explainShade } from "@/lib/lips/explain";
import { describeFinishMismatch, type Finish } from "@/lib/lips/finish";
import { shareCaption, shareFacts } from "@/lib/share";

type Config = { demo: boolean; demoReady: boolean; demoProducts: string[] };
type Start = { fileId: string; selfieImage: string; transferImage: string; lookImage?: string };
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

const label = (p: LipProduct) => `${p.shade}, ${p.name}`;

type ShadeCard = ProofCard & { crop?: string; image: string; round: 1 | 2 };

const cap = (w: string) => `${w[0].toUpperCase()}${w.slice(1)}`;

/** Color explanation plus a finish note when the finish differs from the look. */
function whyText(targetHex: string, card: ProofCard, lookFinish?: Finish): string {
  const e = explainShade(targetHex, card.hex);
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
  /** The look photo may show a friend: it goes to YouCam, so the shopper must confirm permission. */
  const [lookConsent, setLookConsent] = useState(false);
  const [selfieCheck, setSelfieCheck] = useState<LipResult | null>(null);
  const [lookCheck, setLookCheck] = useState<LipResult | null>(null);

  const [start, setStart] = useState<Start | null>(null);
  const [lipsOnly, setLipsOnly] = useState("");
  const [showFull, setShowFull] = useState(false);
  const [target, setTarget] = useState<LipResult | null>(null);

  const [cards, setCards] = useState<ShadeCard[]>([]);
  const [cart, setCart] = useState<LipProduct[]>([]);
  const [shareImage, setShareImage] = useState<{ url: string; blob: Blob; caption: string } | null>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    fetch("/api/look/config").then((r) => r.json()).then(setConfig).catch(() => setConfig({ demo: false, demoReady: false, demoProducts: [] }));
  }, []);

  async function onPick(kind: "selfie" | "look", file: File | null) {
    setError("");
    if (kind === "selfie") { setSelfie(file); setSelfieCheck(null); } else { setLook(file); setLookCheck(null); setLookConsent(false); }
    if (!file) return;
    setStatus(`Checking your ${kind === "selfie" ? "selfie" : "look photo"}…`);
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
    const stop = tickStatus(setStatus, "Putting the look on your face… usually 15–40 seconds");
    try {
      const form = new FormData();
      if (selfie) form.append("selfie", selfie);
      if (look) form.append("look", look);
      if (lookConsent) form.append("consent", "yes");
      const s = (await fetchJson("/api/look/start", { method: "POST", body: form }, 120_000)) as Start;
      stop();
      setStatus("Finding your lips in the result…");

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
      setStage("preview");
      setStatus("Here's the look on you. Only your lips were changed.");
    } catch (e) {
      stop();
      setStage("upload");
      setStatus("");
      setError((e as Error).message);
    }
  }

  type MeasuredShade = { product: LipProduct; hex: string; crop?: string; image: string; round: 1 | 2 };

  /** Tries shades on the selfie (YouCam) and measures each result's lips (browser). */
  async function tryAndMeasure(picks: LipProduct[], text: string, round: 1 | 2): Promise<{ measured: MeasuredShade[]; failed: LipProduct[] }> {
    const stop = tickStatus(setStatus, text);
    try {
      const json = await fetchJson("/api/look/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: start!.fileId, productIds: picks.map((p) => p.id) }),
      }, 180_000);
      stop();
      setStatus("Measuring each shade on your lips…");
      const { measureLipsInImage, toBitmap } = await step("loading face model", 30_000, detect);
      const measured: MeasuredShade[] = [];
      const failed: LipProduct[] = [];
      for (const product of picks) {
        const r = (json.results as { productId: string; image?: string }[]).find((x) => x.productId === product.id);
        const img = r?.image;
        const m = img ? await step(`measuring ${product.id}`, 15_000, async () => measureLipsInImage(await toBitmap(img))) : null;
        if (r?.image && m?.faceFound) measured.push({ product, hex: m.hex, crop: m.lipCrop, image: r.image, round });
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
      // Round 1: shades closest to the look photo.
      const lookFinish = lookCheck.finish;
      const picks = pickCandidates(lookCheck.hex, { families: 2, allowed, finish: lookFinish });
      const round1 = await tryAndMeasure(picks, `Trying ${picks.length} matching shades on your face…`, 1);
      let measured = round1.measured;
      const failed = [...round1.failed];
      if (!measured.length) throw new Error("None of the try-ons worked. Please try again.");

      // Round 2: if nothing is very close yet, calibrate to these lips and try adjusted shades.
      const closest = Math.min(...measured.map((m) => deltaE2000(target.hex, m.hex)));
      if (closest >= DUPE_DELTA_E) {
        const { picks: refined } = refineCandidates(target.hex, measured, { families: 1, allowed, finish: lookFinish });
        if (refined.length) {
          const round2 = await tryAndMeasure(refined, "Calibrating to your lips: trying adjusted shades…", 2);
          measured = [...measured, ...round2.measured];
          failed.push(...round2.failed);
        }
      }

      const proof = buildProof(target.hex, measured, lookFinish).map((c) => {
        const m = measured.find((x) => x.product.id === c.product.id)!;
        return { ...c, crop: m.crop, image: m.image, round: m.round };
      });
      setCards(proof);
      setStage("proof");
      const best = bestBuy(proof);
      const failNote = failed.length ? ` ${failed.length} shade${failed.length > 1 ? "s" : ""} couldn't be tried (${failed.map((p) => p.shade).join(", ")}).` : "";
      setStatus((best ? `Best buy: ${label(best.product)}, ${best.score}% match for $${best.product.price}.` : "") + failNote);
      setTimeout(() => resultsRef.current?.focus(), 0);
    } catch (e) {
      setStage("preview");
      setStatus("");
      setError((e as Error).message);
    }
  }

  function addToCart(p: LipProduct) {
    setCart((x) => {
      const next = [...x, p];
      setStatus(`Added ${label(p)} for $${p.price}. Cart total $${next.reduce((sum, i) => sum + i.price, 0)}.`);
      return next;
    });
  }

  async function makeShareCard() {
    const b = bestBuy(cards);
    const crop = cards.find((c) => c.product.id === b?.product.id)?.crop;
    if (!b || !crop || !target?.lipCrop) return;
    try {
      const { renderShareCard } = await import("@/lib/share-card");
      const facts = shareFacts(b, lookCheck?.finish);
      const blob = await renderShareCard(facts, target.lipCrop, crop);
      if (shareImage) URL.revokeObjectURL(shareImage.url);
      setShareImage({ url: URL.createObjectURL(blob), blob, caption: shareCaption(facts) });
      setStatus("Your result card is ready below. Download it or share it.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function shareCard() {
    if (!shareImage) return;
    const file = new File([shareImage.blob], "steal-the-look.png", { type: "image/png" });
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

  function restart() {
    if (shareImage) URL.revokeObjectURL(shareImage.url);
    setShareImage(null);
    setStage("upload"); setStart(null); setLipsOnly(""); setTarget(null); setCards([]); setShowFull(false); setError(""); setStatus("");
  }

  const demo = config?.demo;
  const photosReady = !!(selfie && look && selfieCheck && lookCheck && !photoProblem(selfieCheck) && !photoProblem(lookCheck));
  const canStart = demo ? config?.demoReady : photosReady && lookConsent;
  const best = bestBuy(cards);
  const cartTotal = cart.reduce((s, p) => s + p.price, 0);

  return (
    <main className="wide">
      <header>
        <h1>Steal the Look, <em>for Less</em></h1>
        <p className="tagline">See any lipstick look on your face, then get the shade that matches it best for the lowest price, proven on your own lips.</p>
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

      {/* 1. Upload */}
      <section className="panel" aria-labelledby="s1">
        <h2 id="s1"><span className="step">1</span> Your photos</h2>
        {demo ? (
          <p>The demo uses the recorded selfie and look. Press <strong>See it on me</strong>.</p>
        ) : (
          <>
            <div className="pickers">
              <PhotoPicker title="Your selfie" hint="Front-facing, no glasses, bare or light lips, good light." file={selfie} check={selfieCheck} onPick={(f) => onPick("selfie", f)} disabled={stage !== "upload"} />
              <PhotoPicker title="A look you love" hint="A friend's photo, a photo of you, or any look you have permission to use. One face, lips clearly visible." file={look} check={lookCheck} onPick={(f) => onPick("look", f)} disabled={stage !== "upload"} />
            </div>
            <p className="hint" id="photo-privacy">
              Both photos are sent to YouCam to create the try-ons and kept by them for up to 24 hours. We don&apos;t store them.
            </p>
            <label className="toggle consent">
              <input
                type="checkbox"
                checked={lookConsent}
                onChange={(e) => setLookConsent(e.target.checked)}
                disabled={stage !== "upload"}
                aria-describedby="photo-privacy"
              />
              I have permission to use the look photo: it&apos;s me, or the person in it agreed.
            </label>
            {photosReady && !lookConsent && <p className="hint">Tick the permission box to continue.</p>}
          </>
        )}
        <button className="big primary" onClick={seeItOnMe} disabled={!canStart || stage !== "upload"}>
          {stage === "transferring" ? "Working…" : "See it on me"}
        </button>
      </section>

      {/* 2. See it on you */}
      {start && (
        <section className="panel" aria-labelledby="s2">
          <h2 id="s2"><span className="step">2</span> The look on you</h2>
          <div className="compare">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={showFull ? start.transferImage : lipsOnly} alt={showFull ? "Your photo with the full makeup look applied" : "Your photo with only the lip color from the look applied"} />
              <figcaption>{showFull ? "Full look (skin, brows, eyes and lips)" : "Lips only: what we'll match"}</figcaption>
            </figure>
            {target && (
              <div>
                <p className="swatch-row">
                  <span className="swatch big-swatch" style={{ background: target.hex }} aria-hidden />
                  <span>Target lip color on you<br /><strong>{target.hex}</strong></span>
                </p>
                {lookCheck && <p>Finish of the look: <strong>{cap(lookCheck.finish)}</strong> <span className="hint">(measured from the look photo)</span></p>}
                <label className="toggle">
                  <input type="checkbox" checked={showFull} onChange={(e) => setShowFull(e.target.checked)} /> Show the full look
                </label>
              </div>
            )}
          </div>
          {stage === "preview" || stage === "trying" ? (
            <button className="big primary" onClick={findForLess} disabled={stage === "trying"}>
              {stage === "trying" ? "Trying shades on you…" : "Find it for less"}
            </button>
          ) : null}
        </section>
      )}

      {/* 3 + 4. Proof */}
      {cards.length > 0 && (
        <section className="panel" aria-labelledby="s3">
          <h2 id="s3" tabIndex={-1} ref={resultsRef}><span className="step">3</span> Proven on your lips</h2>
          {best && (
            <p className="best">
              <strong>Best buy:</strong> {label(best.product)}: {best.score}% match to the look, <strong>${best.product.price}</strong>
              {best.savings ? <> (save ${best.savings} vs. the premium version)</> : null}.
              {target && <><br /><span className="why">{whyText(target.hex, best, lookCheck?.finish)}</span></>}
            </p>
          )}
          {best && (
            <div className="share">
              {!shareImage ? (
                <button onClick={makeShareCard}>Share my result</button>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shareImage.url} alt={`Result card: ${shareImage.caption}`} className="share-preview" />
                  <div className="actions">
                    <a className="button-like" href={shareImage.url} download="steal-the-look.png">Download image</a>
                    <button onClick={shareCard}>Share…</button>
                    <button onClick={() => navigator.clipboard.writeText(shareImage.caption).then(() => setStatus("Caption copied."))}>Copy caption</button>
                  </div>
                  <p className="hint">Only the lip close-ups are shown, not your whole face. Caption: &ldquo;{shareImage.caption}&rdquo;</p>
                </>
              )}
            </div>
          )}
          {(() => {
            const groups = groupByFamily(cards);
            const strong = groups.filter((g) => !g.weak), weak = groups.filter((g) => g.weak);
            const render = (g: (typeof groups)[number]) => (
              <ShadeGroupCard key={g.family} group={g} targetCrop={target?.lipCrop} targetHex={target?.hex} lookFinish={lookCheck?.finish} bestId={best?.product.id} onAdd={addToCart} />
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
          <p className="hint">Match % compares each shade on your lips with the look on your lips (CIEDE2000 color difference). Under 4 looks the same to most people.</p>
        </section>
      )}

      {/* 5. Cart */}
      {cart.length > 0 && (
        <section className="panel" aria-labelledby="s5">
          <h2 id="s5"><span className="step">4</span> Your cart</h2>
          <ul>
            {cart.map((p, i) => <li key={`${p.id}-${i}`}>{label(p)}: ${p.price}</li>)}
          </ul>
          <p><strong>Total: ${cartTotal}</strong></p>
          <p className="hint">Demo store: no order is placed.</p>
        </section>
      )}

      {stage !== "upload" && <button onClick={restart}>Start over</button>}
      <footer><a href="/retailer">For retailers</a> · <a href="/lab/lips">Lip lab</a></footer>
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

function ShadeGroupCard({ group, targetCrop, targetHex, lookFinish, bestId, onAdd }: {
  group: ReturnType<typeof groupByFamily<ShadeCard>>[number];
  targetCrop?: string;
  targetHex?: string;
  lookFinish?: Finish;
  bestId?: string;
  onAdd: (p: LipProduct) => void;
}) {
  const calibrated = group.variants.some((v) => v.round === 2);
  const headingId = `shade-${group.family}`;
  return (
    <li className={`group ${group.variants.some((v) => v.product.id === bestId) ? "is-best" : ""}`}>
      <article aria-labelledby={headingId}>
        <header className="group-head">
          <h3 id={headingId}>{group.shade}</h3>
          {calibrated && <span className="tag" title="Chosen after measuring how colors shift on your lips">Calibrated to your lips</span>}
        </header>
        <div className="variants">
          {targetCrop && (
            <figure className="variant target">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={targetCrop} alt="The look's lip color on you" />
              <figcaption>The look on you</figcaption>
            </figure>
          )}
          {group.variants.map((c) => {
            const why = targetHex ? whyText(targetHex, c, lookFinish) : null;
            return (
            <figure key={c.product.id} className={`variant ${c.product.id === bestId ? "is-best" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.crop && <img src={c.crop} alt={`${label(c.product)} on your lips. ${why ?? ""}`} />}
              <figcaption>
                {c.product.id === bestId && <span className="tag best-tag">Best buy</span>}
                <span className="card-brand">{c.product.name}</span>
                <span className="price">${c.product.price}</span>
                <span><span className="score">{c.score}%</span> match · {c.verdict}</span>
                <span className={`finish ${c.finishMatch === false ? "finish-off" : ""}`}>
                  {cap(c.finish)} finish{c.finishMatch === true ? " ✓ same as the look" : c.finishMatch === false ? `, the look is ${lookFinish}` : ""}
                </span>
                {why && <span className="why">{why}</span>}
                <span className="hint">ΔE {c.deltaE}</span>
                {c.dupe && (
                  <span className={c.dupe.isTrueDupe ? "dupe-ok" : "dupe-no"}>
                    {c.dupe.isTrueDupe
                      ? `✓ Same as the $${c.product.price + (c.savings ?? 0)} version on you · save $${c.savings}`
                      : `✗ Sold as a dupe, but noticeably different on you`}
                  </span>
                )}
                <button onClick={() => onAdd(c.product)} aria-label={`Add ${label(c.product)}, $${c.product.price}, to cart`}>Add to cart</button>
              </figcaption>
            </figure>
            );
          })}
        </div>
      </article>
    </li>
  );
}
