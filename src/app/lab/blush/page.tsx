"use client";
// Feasibility lab for blush matching: measures the "blush tint" (cheeks minus
// forehead, same photo) so foundation changes cancel out. Runs in the browser;
// no API units are used here.

import { useState } from "react";
import type { CheekResult } from "@/lib/lips/detect";
import { tintDifference } from "@/lib/lips/measure";

type Item = { id: string; name: string; result: CheekResult; overlayUrl: string };

const fmt = (x: number) => (x > 0 ? `+${x}` : `${x}`);

export default function BlushLab() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pair, setPair] = useState<[string, string]>(["", ""]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      const { measureCheeksInImage, toBitmap } = await import("@/lib/lips/detect");
      const out: Item[] = [];
      for (const file of Array.from(files)) {
        const result = await measureCheeksInImage(await toBitmap(file));
        out.push({ id: `${file.name}-${Date.now()}-${out.length}`, name: file.name, result, overlayUrl: result.overlay.toDataURL("image/jpeg", 0.85) });
      }
      setItems((prev) => [...prev, ...out]);
    } catch (e) {
      setError(`Measurement failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const a = items.find((i) => i.id === pair[0])?.result.tint;
  const b = items.find((i) => i.id === pair[1])?.result.tint;

  return (
    <main style={{ maxWidth: "60rem" }}>
      <h1>Blush lab</h1>
      <p className="tagline">
        Measures the color blush adds: cheeks (pink outline) compared with the forehead (yellow outline) in the same photo. No API units are used.
      </p>

      <section className="panel">
        <h2>1. Add photos</h2>
        <p>Try a bare selfie and a Makeup Transfer result (e.g. <code>public/demo/look/selfie.jpg</code> and <code>transfer.jpg</code>), or blush try-ons.</p>
        <label className="big button-like">
          {busy ? "Measuring…" : "Choose photos"}
          <input type="file" accept="image/*" multiple className="visually-hidden" disabled={busy} onChange={(e) => onFiles(e.target.files)} />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
      </section>

      {items.map((it) => {
        const t = it.result.tint;
        return (
          <section key={it.id} className="panel" aria-label={`Result for ${it.name}`}>
            <h2 style={{ wordBreak: "break-all" }}>{it.name}</h2>
            <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.overlayUrl} alt="Photo with the measured cheeks outlined in pink and the forehead in yellow" style={{ width: "100%", borderRadius: 8 }} />
              <div>
                {t ? (
                  <>
                    <p style={{ fontSize: "1.2rem" }}>
                      Blush tint: <strong>redness {fmt(t.da)}</strong> · yellowness {fmt(t.db)} · lightness {fmt(t.dL)}
                    </p>
                    <p className="hint">
                      Redness is how much pinker/redder the cheeks are than the forehead. Bare skin measured +1.8 to +3.7; visible blush adds more.
                      Lightness mostly reflects lighting (overhead light darkens cheeks), so it counts for little in comparisons.
                    </p>
                  </>
                ) : (
                  <p role="alert">{it.result.reasons.join("; ") || "No face found."}</p>
                )}
                {it.result.reasons.length > 0 && t && <p className="hint">{it.result.reasons.join("; ")}</p>}
              </div>
            </div>
          </section>
        );
      })}

      {items.length >= 2 && (
        <section className="panel">
          <h2>2. Compare two blush tints</h2>
          <div className="actions">
            {[0, 1].map((k) => (
              <select key={k} value={pair[k]} onChange={(e) => setPair((p) => (k === 0 ? [e.target.value, p[1]] : [p[0], e.target.value]))}>
                <option value="">Choose photo {k === 0 ? "A" : "B"}</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            ))}
          </div>
          {a && b && (
            <p style={{ fontSize: "1.3rem" }}>
              Tint difference <strong>{tintDifference(a, b)}</strong> (redness {fmt(Math.round((b.da - a.da) * 10) / 10)} from A to B)
            </p>
          )}
        </section>
      )}
      <footer><a href="/lab/lips">Lip lab</a> · <a href="/">Shopper demo</a></footer>
    </main>
  );
}
