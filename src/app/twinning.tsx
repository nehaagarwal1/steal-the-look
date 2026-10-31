"use client";
// "Twinning ✨" ending: the look photo and my look slide in, lean toward each other, sparkle,
// then the caption and what I kept. Drawn on a canvas so the same animation can be saved as
// a short video (recorded in the browser; nothing is uploaded). Timeline: src/lib/twinning.ts.

import { useEffect, useRef, useState } from "react";
import { pickVideoType, TWINNING_SECONDS, twinningFrame, twinningNameLine, twinningSubtitle } from "@/lib/twinning";

const W = 720, H = 1280;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const PHOTO_W = 300, PHOTO_H = 400, PHOTO_Y = 640;
const SPARKLE_COLORS = ["#FFD86B", "#FF9EC7", "#FFFFFF", "#C9A7FF"];
const CONFETTI_COLORS = ["#FF6FA8", "#FFD86B", "#8FB3FF", "#7EE2A0", "#C9A7FF"];

type TweakTab = "lipstick" | "blush" | "hair";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load a picture for the reveal"));
    img.src = src;
  });
}

/** Draws `img` filling a w×h box (cropped, not stretched), centered on (0, 0). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, -w / 2, -h / 2, w, h);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.3 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function text(ctx: CanvasRenderingContext2D, s: string, y: number, size: number, color: string, weight = 700, alpha = 1, scale = 1) {
  if (!s || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2, y);
  ctx.scale(scale, scale);
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(s, 0, 0);
  ctx.restore();
}

/** One frame. `t` = seconds into the reveal; `now`/`confettiAt` (ms) drive the twinkle and confetti. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  now: number,
  imgs: { look: HTMLImageElement; me: HTMLImageElement },
  copy: { subtitle: string; nameLine: string; meLabel: string; lookLabel: string },
  confettiAt: number | null,
  still: boolean,
) {
  const f = twinningFrame(t);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1B1424");
  bg.addColorStop(1, "#3A1F3D");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  text(ctx, "Pretty Smart", 80, 34, "#B9B9C6", 700);
  text(ctx, "Twinning ✨", 230, 96, "#FFFFFF", 900, f.title, 0.6 + 0.4 * f.title);

  // The two photos: slide in, then lean toward each other. My look is mirrored, like a selfie.
  const finalX = { look: W / 2 - 170, me: W / 2 + 170 };
  const photos = [
    { img: imgs.look, x: -PHOTO_W + (finalX.look + PHOTO_W) * f.slide, tilt: 0.1 * f.lean, mirror: false, label: copy.lookLabel },
    { img: imgs.me, x: W + PHOTO_W - (W + PHOTO_W - finalX.me) * f.slide, tilt: -0.1 * f.lean, mirror: true, label: copy.meLabel },
  ];
  for (const p of photos) {
    ctx.save();
    ctx.translate(p.x, PHOTO_Y);
    ctx.rotate(p.tilt);
    ctx.fillStyle = "#FFFFFF";
    roundedRect(ctx, -PHOTO_W / 2 - 8, -PHOTO_H / 2 - 8, PHOTO_W + 16, PHOTO_H + 16, 26);
    ctx.fill();
    roundedRect(ctx, -PHOTO_W / 2, -PHOTO_H / 2, PHOTO_W, PHOTO_H, 20);
    ctx.clip();
    if (p.mirror) ctx.scale(-1, 1);
    drawCover(ctx, p.img, PHOTO_W, PHOTO_H);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = f.slide;
    ctx.font = `700 34px ${FONT}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(p.label, p.x, PHOTO_Y + PHOTO_H / 2 + 60);
    ctx.restore();
  }

  // Sparkles between the two faces: a burst, then a gentle twinkle.
  if (f.sparkle > 0) {
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + i * 0.37;
      const dist = (30 + ((i * 47) % 110)) * f.sparkle;
      const twinkle = still ? 0.9 : 0.55 + 0.45 * Math.sin(now / 180 + i * 1.7);
      ctx.globalAlpha = Math.min(1, f.sparkle * 2) * twinkle;
      ctx.fillStyle = SPARKLE_COLORS[i % SPARKLE_COLORS.length];
      star(ctx, W / 2 + Math.cos(angle) * dist, PHOTO_Y - 120 + Math.sin(angle) * dist * 0.8, 7 + (i % 4) * 4);
    }
    ctx.globalAlpha = 1;
  }

  text(ctx, copy.subtitle, 1010, 52, "#FFFFFF", 800, f.subtitle);
  text(ctx, copy.nameLine, 1080, 40, "#FF9EC7", 700, f.subtitle);
  text(ctx, "Pretty looks. Smart picks.", 1210, 32, "#8FB3FF", 700, f.subtitle);

  // Confetti after "Love it 💖".
  if (confettiAt !== null) {
    const ct = (now - confettiAt) / 1000;
    if (ct < 3) {
      for (let i = 0; i < 90; i++) {
        const x = ((i * 97) % W) + Math.sin(ct * 3 + i) * 20;
        const y = -40 + ct * (300 + ((i * 53) % 260)) - ((i * 31) % 200);
        if (y < -20 || y > H) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - ct / 3);
        ctx.translate(x, y);
        ctx.rotate(ct * 5 + i);
        ctx.fillStyle = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        ctx.fillRect(-6, -10, 12, 20);
        ctx.restore();
      }
    }
  }
}

export function Twinning(props: {
  lookSrc: string;
  mySrc: string;
  kept: number;
  firstName: string;
  /** "The look", or "AI-generated look" for a synthetic look photo. */
  lookLabel?: string;
  onLove: () => void;
  onTweak: (tab: TweakTab) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef(0);
  const confettiRef = useRef<number | null>(null);
  const [imgs, setImgs] = useState<{ look: HTMLImageElement; me: HTMLImageElement } | null>(null);
  const [answer, setAnswer] = useState<null | "love" | "tweak">(null);
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState("");
  const [still, setStill] = useState(false);

  const copy = {
    subtitle: twinningSubtitle(props.kept),
    nameLine: twinningNameLine(props.firstName),
    meLabel: props.firstName || "Me",
    lookLabel: props.lookLabel ?? "The look",
  };
  const copyRef = useRef(copy);
  copyRef.current = copy;

  useEffect(() => {
    let cancelled = false;
    setImgs(null);
    Promise.all([loadImage(props.lookSrc), loadImage(props.mySrc)])
      .then(([look, me]) => { if (!cancelled) setImgs({ look, me }); })
      .catch((e: Error) => { if (!cancelled) setNote(e.message); });
    return () => { cancelled = true; };
  }, [props.lookSrc, props.mySrc]);

  useEffect(() => {
    if (!imgs || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* old browser */ }
    setStill(reduce);
    // Reduced motion: show the finished card right away (Replay still plays it on request).
    startRef.current = performance.now() - (reduce ? TWINNING_SECONDS * 1000 : 0);
    let raf = 0;
    const loop = (now: number) => {
      const t = Math.min(TWINNING_SECONDS, (now - startRef.current) / 1000);
      drawFrame(ctx, t, now, imgs, copyRef.current, confettiRef.current, reduce);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [imgs]);

  const replay = () => { startRef.current = performance.now(); };

  async function saveVideo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setNote("");
    const type = typeof MediaRecorder !== "undefined" && "captureStream" in canvas ? pickVideoType((t) => MediaRecorder.isTypeSupported(t)) : null;
    if (!type) {
      // No video recording in this browser: save the finished card as a picture instead.
      startRef.current = performance.now() - TWINNING_SECONDS * 1000;
      await new Promise((r) => setTimeout(r, 100));
      canvas.toBlob((b) => b && download(b, "pretty-smart-twinning.png"), "image/png");
      setNote("This browser can't record video, so the finished card was saved as a picture.");
      return;
    }
    setRecording(true);
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: type.mime });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      download(new Blob(chunks, { type: type.mime.split(";")[0] }), `pretty-smart-twinning.${type.ext}`);
      setRecording(false);
      setNote("Saved.");
    };
    rec.start();
    replay();
    setTimeout(() => rec.stop(), (TWINNING_SECONDS + 0.6) * 1000);
  }

  function love() {
    confettiRef.current = performance.now();
    setAnswer("love");
    props.onLove();
  }

  return (
    <div className="twinning">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        role="img"
        aria-label={`Twinning: the ${props.lookLabel === "AI-generated look" ? "AI-generated " : ""}look photo and my look side by side. ${copy.subtitle} ${copy.nameLine}`}
      />
      <div className="actions">
        <button onClick={replay} disabled={!imgs || recording}>↺ Replay</button>
        <button onClick={saveVideo} disabled={!imgs || recording}>{recording ? "Recording… (6 seconds)" : "Save as video"}</button>
      </div>
      {note && <p role="status">{note}</p>}
      {still && <p className="hint">Animations are reduced on this device; press Replay to play it.</p>}

      <div className="happy">
        <div className="actions">
          <button className="big primary" aria-pressed={answer === "love"} onClick={love}>Love it 💖</button>
          <button className="big" aria-pressed={answer === "tweak"} onClick={() => setAnswer("tweak")}>Let me play more</button>
        </div>
        {answer === "love" && <p role="status">Obsessed! 💖 Grab my look below.</p>}
        {answer === "tweak" && (
          <div className="actions" role="group" aria-label="What to tweak">
            <button onClick={() => props.onTweak("lipstick")}>My lipstick</button>
            <button onClick={() => props.onTweak("blush")}>My blush</button>
            <button onClick={() => props.onTweak("hair")}>My hair &amp; brows</button>
          </div>
        )}
      </div>
    </div>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
