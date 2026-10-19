"use client";
// Retailer Dupe Audit: tests premium-vs-dupe shade pairs on several consenting
// faces and reports where each "dupe" really matches. Lips are measured in the
// browser; the report holds numbers and anonymous face labels only.

import { useEffect, useMemo, useState } from "react";
import type { LipResult } from "@/lib/lips/detect";
import {
  allPairsCsv, refreshReport, buildAuditReport, catalogPairs, catalogToCsv, csvTemplate, DEFAULT_AUDIT_FAMILIES, faceLabel, faceMix, faceTitle, parseShadeCsv, reportToCsv,
  type AuditFace, type AuditMeasurement, type AuditReport, type CellVerdict, type ShadePair,
} from "@/lib/audit";
import { FACE_PRESETS, SOURCE_LABEL, SYNTHETIC_PREFIX, sourceFromFilename, type FaceSource } from "@/lib/synthetic-faces";

type Config = { demo: boolean; recording: boolean };
type Face = { label: string; file: File; check: LipResult; preview: string; source: FaceSource };

const MAX_FACES = 5;
const SHADES_PER_REQUEST = 6;
const detect = () => import("@/lib/lips/detect");

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const VERDICT_CLASS: Record<CellVerdict, string> = { "true dupe": "cell-ok", close: "cell-close", different: "cell-no" };

export default function DupeAudit() {
  const [config, setConfig] = useState<Config | null>(null);
  const [pairs, setPairs] = useState<ShadePair[]>(() => catalogPairs(DEFAULT_AUDIT_FAMILIES));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(catalogPairs(DEFAULT_AUDIT_FAMILIES).map((p) => p.id)));
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [faces, setFaces] = useState<Face[]>([]);
  const [consent, setConsent] = useState(false);
  const [presets, setPresets] = useState<Set<string>>(new Set());
  const [customPerson, setCustomPerson] = useState("");
  const [generating, setGenerating] = useState(false);
  /** The generator panel's open state is tracked here so re-renders never collapse it. */
  const [genOpen, setGenOpen] = useState(true);
  /** Generated faces that failed the lip check: kept so the (already paid for) images can be saved and inspected. */
  const [unusable, setUnusable] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [fromDemo, setFromDemo] = useState(false);

  useEffect(() => {
    fetch("/api/look/config").then((r) => r.json()).then((c: Config) => {
      setConfig(c);
      if (c.demo) {
        fetch("/demo/audit/report.json")
          .then((r) => (r.ok ? r.json() : null))
          .then((r: AuditReport | null) => { if (r) { setReport(refreshReport(r)); setFromDemo(true); } })
          .catch(() => undefined);
      }
    }).catch(() => setConfig({ demo: false, recording: false }));
  }, []);

  const activePairs = useMemo(() => pairs.filter((p) => selected.has(p.id)), [pairs, selected]);
  /** Identifies the current real volunteers; consent must be re-confirmed whenever it changes. */
  const realKey = faces.filter((f) => f.source === "real").map((f) => `${f.file.name}:${f.file.size}`).join("|");
  useEffect(() => setConsent(false), [realKey]);
  const tryOns = faces.length * activePairs.length * 2;

  async function onCsv(file: File | undefined) {
    if (!file) return;
    const { pairs: parsed, errors } = parseShadeCsv(await file.text());
    setCsvErrors(errors);
    if (parsed.length) {
      setPairs(parsed);
      setSelected(new Set(parsed.map((p) => p.id)));
      setStatus(`Loaded ${parsed.length} shade pair${parsed.length > 1 ? "s" : ""} from ${file.name}.`);
    }
  }

  /**
   * Checks photos in the browser and appends the good ones to the current list
   * (functional update, so concurrent adds never overwrite each other).
   * Returns the ones that failed, with reasons.
   */
  async function addFaces(files: FileList | File[] | null, forceSource?: FaceSource): Promise<{ file: File; reason: string }[]> {
    if (!files) return [];
    setError("");
    const list = Array.from(files);
    const rejected: { file: File; reason: string }[] = [];
    const accepted: Face[] = [];
    try {
      const { measureLipsInImage, toBitmap } = await detect();
      for (const file of list) {
        setStatus(`Checking ${file.name}…`);
        console.info(`[audit] checking ${file.name} (${Math.round(file.size / 1024)} KB)`);
        try {
          const check = await measureLipsInImage(await toBitmap(file));
          console.info(`[audit] ${file.name}: face ${check.faceFound}, faces ${check.faceCount}, confidence ${check.confidence}`);
          if (!check.faceFound || check.faceCount > 1 || check.confidence === "low") {
            rejected.push({ file, reason: !check.faceFound ? "no face found" : check.faceCount > 1 ? "more than one face" : check.reasons.join("; ") });
            continue;
          }
          accepted.push({ label: "", file, check, preview: check.lipCrop ?? "", source: forceSource ?? sourceFromFilename(file.name) });
        } catch (e) {
          console.error(`[audit] checking ${file.name} failed`, e);
          rejected.push({ file, reason: `couldn't read the image (${(e as Error).message})` });
        }
      }
    } finally {
      setFaces((prev) => {
        const merged = [...prev, ...accepted];
        if (merged.length > MAX_FACES) setError(`An audit uses at most ${MAX_FACES} faces; extra photos weren't added.`);
        return merged.slice(0, MAX_FACES).map((f, i) => ({ ...f, label: faceLabel(i) }));
      });
      setStatus("");
    }
    if (rejected.length) {
      setError(rejected.map((r) => `${r.file.name}: ${r.reason}.`).join(" ") + " Use a clear, front-facing photo of one person, no glasses.");
    }
    return rejected;
  }


  /** Generates AI faces (YouCam AI Image Generator, 1 unit each) and adds them as synthetic test faces. */
  async function generateFaces() {
    const jobs = [...[...presets].map((id) => ({ presetId: id })), ...(customPerson.trim() ? [{ person: customPerson.trim() }] : [])];
    if (!jobs.length) return;
    if (faces.length + jobs.length > MAX_FACES) { setError(`An audit uses at most ${MAX_FACES} faces. Remove some or pick fewer.`); return; }
    setGenerating(true);
    setError("");
    const made: File[] = [];
    try {
      for (const [i, job] of jobs.entries()) {
        setStatus(`Generating synthetic face ${i + 1} of ${jobs.length}… (about 20–40 seconds each)`);
        const res = await fetch("/api/audit/synthetic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        console.info(`[audit] generated ${json.presetId}: ${Math.round(json.image.length / 1024)} KB${json.savedTo ? `, saved to ${json.savedTo}` : ""}${json.reused ? " (reused, no units)" : ""}`);
        const blob = await (await fetch(json.image)).blob();
        made.push(new File([blob], json.savedTo ? json.savedTo.split("/").pop() : `${SYNTHETIC_PREFIX}${json.presetId}-${Date.now()}.jpg`, { type: "image/jpeg" }));
      }
    } catch (e) {
      setError(`Face generation stopped: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
    if (made.length) {
      try {
        const rejected = await addFaces(made, "synthetic");
        setUnusable(rejected.map((r) => r.file));
        const added = made.length - rejected.length;
        setPresets(new Set());
        setCustomPerson("");
        setStatus(
          `Added ${added} synthetic face${added === 1 ? "" : "s"}.` +
          (rejected.length ? ` ${rejected.length} didn't pass the lip check; you can save ${rejected.length > 1 ? "them" : "it"} below to see why.` : ' Use "Save" on a face to keep the image.'),
        );
      } catch (e) {
        console.error("[audit] adding generated faces failed", e);
        setUnusable(made);
        setError(`The faces were generated but couldn't be added: ${(e as Error).message}. You can save them below.`);
      }
    }
  }

  function saveFile(file: File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const saveFaceImage = (f: Face) => saveFile(f.file);

  async function runAudit() {
    setError("");
    setReport(null);
    setFromDemo(false);
    setRunning(true);
    const measurements: AuditMeasurement[] = [];
    const auditFaces: AuditFace[] = [];
    let failed = 0;
    try {
      const { measureLipsInImage, toBitmap } = await detect();
      for (const face of faces) {
        setStatus(`Face ${face.label}: uploading…`);
        const form = new FormData();
        form.append("face", face.file);
        form.append("consent", consent ? "yes" : "no");
        form.append("source", face.source);
        const up = await fetch("/api/audit/face", { method: "POST", body: form });
        const upJson = await up.json();
        if (!up.ok) throw new Error(`Face ${face.label}: ${upJson.error}`);
        auditFaces.push({ label: face.label, naturalLipHex: face.check.hex, source: face.source });

        const shades = activePairs.flatMap((p) => [
          { key: `${p.id}|p`, hex: p.premium.hex, texture: p.premium.texture },
          { key: `${p.id}|d`, hex: p.dupe.hex, texture: p.dupe.texture },
        ]);
        const measured = new Map<string, string>();
        for (let i = 0; i < shades.length; i += SHADES_PER_REQUEST) {
          setStatus(`Face ${face.label}: trying shades ${i + 1}–${Math.min(i + SHADES_PER_REQUEST, shades.length)} of ${shades.length}…`);
          const res = await fetch("/api/audit/tryon", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: upJson.fileId, shades: shades.slice(i, i + SHADES_PER_REQUEST) }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error);
          for (const r of json.results as { key: string; image?: string }[]) {
            if (!r.image) { failed++; continue; }
            const m = await measureLipsInImage(await toBitmap(r.image));
            if (m.faceFound) measured.set(r.key, m.hex); else failed++;
          }
        }
        for (const p of activePairs) {
          const premiumHex = measured.get(`${p.id}|p`), dupeHex = measured.get(`${p.id}|d`);
          if (premiumHex && dupeHex) measurements.push({ pairId: p.id, face: face.label, premiumHex, dupeHex });
        }
      }
      const r = buildAuditReport(activePairs, auditFaces, measurements);
      setReport(r);
      setStatus(`Audit done: ${activePairs.length} pairs on ${auditFaces.length} faces.${failed ? ` ${failed} try-ons failed and were left out.` : ""}`);
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
    } finally {
      setRunning(false);
    }
  }

  async function saveForDemo() {
    if (!report) return;
    const res = await fetch("/api/audit/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report }) });
    const json = await res.json();
    setStatus(res.ok ? `Saved for demo mode: ${json.saved}` : json.error);
  }

  // Consent is only needed for real people; synthetic faces show no one.
  const needsConsent = realKey !== "";
  const canRun = !running && !generating && !config?.demo && faces.length >= 2 && activePairs.length > 0 && (!needsConsent || consent);
  const genCount = presets.size + (customPerson.trim() ? 1 : 0);

  return (
    <main className="wide">
      <h1>Dupe Audit</h1>
      <p className="tagline">Is your lower-priced shade really a dupe? Test it on real people&apos;s lips, not on swatches.</p>
      <div role="status" aria-live="polite" className="status">{status}</div>
      {error && <p role="alert" className="error">{error}</p>}

      {config?.demo && (
        <p className="banner" role="note">
          Demo mode: showing a saved report from a real audit. Live audits need <code>DEMO_MODE=0</code>.
          {!report && " No saved report yet."}
        </p>
      )}

      {!config?.demo && (
        <>
          <section className="panel" aria-labelledby="a1">
            <h2 id="a1"><span className="step">1</span> Shade pairs</h2>
            <p>Each pair is a premium shade and the cheaper shade sold as its dupe. Use the starter set or upload your own.</p>
            <div className="actions">
              <label className="button-like">
                Upload shade CSV
                <input type="file" accept=".csv,text/csv" className="visually-hidden" onChange={(e) => onCsv(e.target.files?.[0])} />
              </label>
              <button onClick={() => download("dupe-audit-template.csv", csvTemplate(), "text/csv")}>Download CSV template</button>
              <button onClick={() => download("catalog.csv", catalogToCsv(), "text/csv")}>Download catalog (CSV)</button>
              <button onClick={() => download("all-pairs-audit.csv", allPairsCsv(), "text/csv")}>Download all pairs (audit CSV)</button>
            </div>
            <p className="hint">
              <strong>Catalog</strong> lists every shade with its exact color, finish and price (and how far it is from its $42 version in the tube).{" "}
              <strong>All pairs</strong> is ready to upload: delete the rows you don&apos;t want (an audit uses up to 20).
            </p>
            {csvErrors.length > 0 && <ul className="error">{csvErrors.map((e) => <li key={e}>{e}</li>)}</ul>}
            <ul className="pair-list">
              {pairs.map((p) => (
                <li key={p.id}>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })}
                    />
                    <span className="swatch" style={{ background: p.premium.hex }} aria-hidden />
                    {p.premium.name} (${p.premium.price})
                    <span aria-hidden> vs </span><span className="visually-hidden"> versus </span>
                    <span className="swatch" style={{ background: p.dupe.hex }} aria-hidden />
                    {p.dupe.name} (${p.dupe.price})
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel" aria-labelledby="a2">
            <h2 id="a2"><span className="step">2</span> Test faces (2–{MAX_FACES})</h2>
            <p>Front-facing selfies, one person each, no glasses, bare or light lips. Faces with different natural lip tones make the audit more useful.</p>
            <label className="button-like">
              Add face photos
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="visually-hidden" disabled={running} onChange={(e) => { addFaces(e.target.files); e.target.value = ""; }} />
            </label>
            {faces.length > 0 && (
              <ul className="face-list">
                {faces.map((f) => (
                  <li key={f.label}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {f.preview && <img src={f.preview} alt={`Face ${f.label} lips`} />}
                    <span>Face {f.label}</span>
                    <label>
                      <span className="visually-hidden">Face {f.label} is </span>
                      <select
                        value={f.source}
                        disabled={running}
                        onChange={(e) => setFaces((x) => x.map((y) => (y.file === f.file ? { ...y, source: e.target.value as FaceSource } : y)))}
                      >
                        <option value="real">{SOURCE_LABEL.real}</option>
                        <option value="synthetic">{SOURCE_LABEL.synthetic}</option>
                      </select>
                    </label>
                    <div className="actions">
                      {f.source === "synthetic" && <button disabled={running} onClick={() => saveFaceImage(f)}>Save</button>}
                      <button disabled={running} onClick={() => setFaces((x) => x.filter((y) => y.file !== f.file).map((y, i) => ({ ...y, label: faceLabel(i) })))}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <details className="more generator" open={genOpen} onToggle={(e) => setGenOpen(e.currentTarget.open)}>
              <summary>Or generate synthetic faces (no real person)</summary>
              <p className="hint">
                AI-generated with the YouCam AI Image Generator: bare lips, front-facing, even light. 1 unit per face. They&apos;re labeled
                &ldquo;synthetic&rdquo; in the report. Real lips can behave a little differently, so mix in real volunteers when you can.
              </p>
              <ul className="pair-list">
                {FACE_PRESETS.map((p) => (
                  <li key={p.id}>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={presets.has(p.id)}
                        disabled={generating || running}
                        onChange={(e) => setPresets((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })}
                      />
                      <strong>{p.label}</strong>: {p.description}
                    </label>
                  </li>
                ))}
              </ul>
              <label>
                Or describe the person (optional):{" "}
                <input
                  type="text"
                  value={customPerson}
                  maxLength={300}
                  disabled={generating || running}
                  onChange={(e) => setCustomPerson(e.target.value)}
                  placeholder="e.g. a Southeast Asian man in his 60s with medium skin and naturally brown-rose lips"
                  className="text-input"
                />
              </label>
              <button className="big" onClick={generateFaces} disabled={!genCount || generating || running}>
                {generating ? "Generating…" : `Generate ${genCount || ""} synthetic face${genCount === 1 ? "" : "s"}${genCount ? ` (${genCount} unit${genCount > 1 ? "s" : ""})` : ""}`}
              </button>
              {unusable.length > 0 && (
                <div>
                  <p className="hint">Generated but not usable for the audit:</p>
                  <div className="actions">
                    {unusable.map((f) => (
                      <button key={f.name} onClick={() => saveFile(f)}>Save {f.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </details>
            {needsConsent ? (
              <label className="toggle consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={running} />
                Each real volunteer ({faces.filter((f) => f.source === "real").map((f) => `Face ${f.label}`).join(", ")}) agreed to be part of this audit.
                Their photos are sent to YouCam for the try-ons (kept by them up to 24 hours); the report has no photos.
              </label>
            ) : faces.length > 0 ? (
              <p className="hint">All faces are synthetic (AI-generated, no real person), so no consent is needed. Marking a face &ldquo;synthetic&rdquo; is your confirmation that it shows no real person.</p>
            ) : null}
          </section>

          <section className="panel" aria-labelledby="a3">
            <h2 id="a3"><span className="step">3</span> Run</h2>
            <p>
              {faces.length} face{faces.length === 1 ? "" : "s"} × {activePairs.length} pair{activePairs.length === 1 ? "" : "s"} × 2 shades ={" "}
              <strong>{tryOns} try-ons ({tryOns} YouCam units)</strong>. Repeat runs on the same photos are cached while the server runs.
            </p>
            <button className="big primary" onClick={runAudit} disabled={!canRun}>{running ? "Running audit…" : "Run audit"}</button>
            {!canRun && !running && <p className="hint">Needs at least 2 faces and 1 pair{needsConsent ? ", and the consent box ticked for the real volunteers" : ""}.</p>}
          </section>
        </>
      )}

      {report && <AuditReportView report={report} demo={fromDemo} recording={!!config?.recording} onSave={saveForDemo} />}

      <footer><a href="/retailer">Back to retailer overview</a> · <a href="/">Shopper demo</a></footer>
    </main>
  );
}

function AuditReportView({ report, demo, recording, onSave }: { report: AuditReport; demo: boolean; recording: boolean; onSave: () => void }) {
  const trueDupes = report.results.filter((r) => r.verdict === "true dupe on every face").length;
  return (
    <section className="panel" aria-labelledby="ar">
      <h2 id="ar">Audit report</h2>
      {demo && <p className="hint">Saved report from a real audit on {new Date(report.createdAt).toLocaleDateString()}.</p>}
      <p className="best">
        <strong>{trueDupes} of {report.results.length}</strong> dupes look the same as their premium shade on every face tested
        ({report.faces.length} faces: {faceMix(report.faces)}).
      </p>
      <div className="table-wrap">
        <table className="audit">
          <caption className="visually-hidden">Difference between each dupe and its premium shade on each test face. Under 4 looks the same.</caption>
          <thead>
            <tr>
              <th scope="col">Shade pair</th>
              {report.faces.map((f) => <th key={f.label} scope="col">{faceTitle(f)}</th>)}
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {report.results.map((r) => (
              <tr key={r.pair.id}>
                <th scope="row">
                  <span className="swatch" style={{ background: r.pair.premium.hex }} aria-hidden /> {r.pair.premium.name} ${r.pair.premium.price}
                  <br />
                  <span className="swatch" style={{ background: r.pair.dupe.hex }} aria-hidden /> {r.pair.dupe.name} ${r.pair.dupe.price}
                  <span className="hint"> · saves ${r.pair.premium.price - r.pair.dupe.price}</span>
                </th>
                {report.faces.map((f) => {
                  const c = r.cells.find((x) => x.face === f.label);
                  return (
                    <td key={f.label} className={c ? VERDICT_CLASS[c.verdict] : ""}>
                      {c ? <><strong>{c.deltaE}</strong><br /><span>{c.verdict}</span></> : "n/a"}
                    </td>
                  );
                })}
                <td>
                  <strong>{r.passes}/{r.cells.length}</strong> faces · {r.verdict}
                  {r.insight && <><br /><em>{r.insight}</em></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Numbers are the color difference (CIEDE2000) between the two shades on that person&apos;s lips. Under 4 looks the same to most people; 7 or more is clearly different.</p>
      <div className="actions">
        <button onClick={() => download("dupe-audit.csv", reportToCsv(report), "text/csv")}>Download report (CSV)</button>
        <button onClick={() => download("dupe-audit.json", JSON.stringify(report, null, 2), "application/json")}>Download report (JSON)</button>
        {recording && !demo && <button onClick={onSave}>Save as demo report</button>}
      </div>
    </section>
  );
}
