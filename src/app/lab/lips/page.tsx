"use client";
// Feasibility lab for "Steal the Look, for Less" (lipstick only).
// Upload photos -> find lips -> measure color -> rank catalog shades -> compare any two.
// Runs entirely in the browser: no YouCam units are spent here.

import { useState } from "react";
import type { LipResult } from "@/lib/lips/detect";
import { compareMeasurements } from "@/lib/lips/measure";
import { lipsticks, rankLipsticks } from "@/lib/lips/match";

type Measured = { id: string; name: string; result: LipResult; overlayUrl: string; bitmap: ImageBitmap; expected?: string };

export default function LipLab() {
  const [items, setItems] = useState<Measured[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pair, setPair] = useState<[string, string]>(["", ""]);
  const [lipsPair, setLipsPair] = useState<[string, string]>(["", ""]);
  const [composite, setComposite] = useState<string>("");

  async function makeComposite() {
    const orig = items.find((i) => i.id === lipsPair[0]);
    const xfer = items.find((i) => i.id === lipsPair[1]);
    if (!orig || !xfer) return;
    try {
      const { lipsOnlyComposite } = await import("@/lib/lips/detect");
      setComposite((await lipsOnlyComposite(orig.bitmap, xfer.bitmap)).toDataURL("image/jpeg", 0.9));
    } catch (e) {
      setError(`Lips-only preview failed: ${(e as Error).message}`);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      const { measureLipsInImage } = await import("@/lib/lips/detect"); // load MediaPipe only on use
      const out: Measured[] = [];
      for (const file of Array.from(files)) {
        const bitmap = await createImageBitmap(file);
        const result = await measureLipsInImage(bitmap);
        out.push({ id: `${file.name}-${Date.now()}-${out.length}`, name: file.name, result, bitmap, overlayUrl: result.overlay.toDataURL("image/jpeg", 0.85) });
      }
      setItems((prev) => [...prev, ...out]);
    } catch (e) {
      console.error(e);
      setError(`Measurement failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const a = items.find((i) => i.id === pair[0]);
  const b = items.find((i) => i.id === pair[1]);
  const cmp = a && b && a.result.faceFound && b.result.faceFound ? compareMeasurements(a.result, b.result) : null;

  return (
    <main style={{ maxWidth: "60rem" }}>
      <h1>Lip color lab</h1>
      <p className="tagline">
        Feasibility test for &ldquo;Steal the Look, for Less&rdquo;. Runs in your browser; no API units are used.
      </p>

      <section className="panel">
        <h2>1. Add photos</h2>
        <p>Use your selfies, try-on results from <code>week1-results/</code>, or a look you&apos;d like to copy (your own or licensed photos).</p>
        <label className="big button-like">
          {busy ? "Measuring…" : "Choose photos"}
          <input type="file" accept="image/*" multiple className="visually-hidden" disabled={busy} onChange={(e) => onFiles(e.target.files)} />
        </label>
        {error && <p role="alert">{error}</p>}
      </section>

      {items.map((it) => {
        const r = it.result;
        const ranked = r.faceFound ? rankLipsticks(r.hex).slice(0, 5) : [];
        // Pass if the applied shade family ranks first; near-identical dupes from other brands count.
        const expectedShade = lipsticks().find((p) => p.id === it.expected)?.shade;
        const roundTrip = expectedShade && ranked.length ? ranked[0].product.shade === expectedShade : undefined;
        return (
          <section key={it.id} className="panel" aria-label={`Result for ${it.name}`}>
            <h2 style={{ wordBreak: "break-all" }}>{it.name}</h2>
            <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.overlayUrl} alt="Photo with the measured lip area outlined in cyan" style={{ width: "100%", borderRadius: 8 }} />
              <div>
                {r.faceFound ? (
                  <>
                    <p style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span aria-hidden style={{ width: 56, height: 56, borderRadius: 8, background: r.hex, border: "2px solid var(--border)" }} />
                      <span>
                        Measured lip color <strong>{r.hex}</strong>
                        <br />
                        L {r.lab.L.toFixed(1)} · a {r.lab.a.toFixed(1)} · b {r.lab.b.toFixed(1)}
                      </span>
                    </p>
                    <p>
                      Confidence: <strong>{r.confidence}</strong> ({r.pixelCount} pixels, spread {r.spread})
                      {r.reasons.length > 0 && <><br />{r.reasons.join("; ")}</>}
                    </p>
                    <h3>Closest catalog shades</h3>
                    <ol>
                      {ranked.map((c) => (
                        <li key={c.product.id}>
                          <span aria-hidden className="swatch" style={{ display: "inline-block", verticalAlign: "middle", background: c.product.hex }} />{" "}
                          {c.product.shade}, {c.product.name} (${c.product.price}): ΔE {c.deltaE}, {c.verdict} <code>{c.product.id}</code>
                        </li>
                      ))}
                    </ol>
                    <label>
                      Shade actually applied (for try-on results):{" "}
                      <select
                        value={it.expected ?? ""}
                        onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, expected: e.target.value || undefined } : x)))}
                      >
                        <option value="">n/a</option>
                        {lipsticks().map((p) => <option key={p.id} value={p.id}>{p.shade} ({p.name})</option>)}
                      </select>
                    </label>
                    {roundTrip !== undefined && (
                      <p><strong>{roundTrip ? "✅ Round trip OK: the applied shade family ranked first" : "❌ Round trip failed: a different shade ranked first"}</strong></p>
                    )}
                  </>
                ) : (
                  <p role="alert">No face found. Try a clearer, front-facing photo.</p>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {items.length >= 2 && (
        <section className="panel">
          <h2>2. Lips-only preview (from a Makeup Transfer)</h2>
          <p>Keeps your original photo and takes only the lips from the transfer result, so skin, brows and eyes stay yours.</p>
          <div className="actions">
            {[0, 1].map((k) => (
              <select key={k} value={lipsPair[k]} onChange={(e) => { setComposite(""); setLipsPair((p) => (k === 0 ? [e.target.value, p[1]] : [p[0], e.target.value])); }}>
                <option value="">{k === 0 ? "Original selfie" : "Transfer result"}</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            ))}
            <button onClick={makeComposite} disabled={!lipsPair[0] || !lipsPair[1]}>Make preview</button>
          </div>
          {composite && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={composite} alt="Original photo with only the lips taken from the makeup transfer" style={{ width: "100%", maxWidth: 480, borderRadius: 8, marginTop: "1rem" }} />
          )}
        </section>
      )}

      {items.length >= 2 && (
        <section className="panel">
          <h2>3. Compare two photos (the &ldquo;dupe proof&rdquo;)</h2>
          <div className="actions">
            {[0, 1].map((k) => (
              <select key={k} value={pair[k]} onChange={(e) => setPair((p) => (k === 0 ? [e.target.value, p[1]] : [p[0], e.target.value]))}>
                <option value="">Choose photo {k === 0 ? "A" : "B"}</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            ))}
          </div>
          {cmp && (
            <p style={{ fontSize: "1.3rem" }}>
              ΔE <strong>{cmp.deltaE}</strong>: <strong>{cmp.verdict}</strong> (match score {cmp.score}/100)
            </p>
          )}
        </section>
      )}
    </main>
  );
}
