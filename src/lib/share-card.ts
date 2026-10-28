"use client";
// Draws the shareable result card (1080x1350, portrait for social feeds) in the browser.
// Only lip close-ups are used, so the shared image doesn't show the whole face.

import { finishLine, priceHeadline, priceLine, type ShareFacts } from "./share";

const W = 1080, H = 1350;
const BG = "#14141A", FG = "#FFFFFF", MUTED = "#B9B9C6", ACCENT = "#8FB3FF", OK = "#7EE2A0";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load an image for the share card"));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws `img` to fill the box (cover), clipped to rounded corners. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  ctx.save();
  roundRect(ctx, x, y, w, h, 28);
  ctx.clip();
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

function centered(ctx: CanvasRenderingContext2D, text: string, y: number, size: number, color: string, weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  // Shrink long lines so they never overflow the card.
  while (ctx.measureText(text).width > W - 120 && size > 24) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${FONT}`;
  }
  ctx.fillText(text, W / 2, y);
}

export async function renderShareCard(f: ShareFacts, lookLips: string, matchLips: string): Promise<Blob> {
  const [look, match] = await Promise.all([loadImage(lookLips), loadImage(matchLips)]);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  centered(ctx, "Pretty Smart", 130, 72, FG, 800);
  centered(ctx, "Pretty looks. Smart picks.", 205, 44, ACCENT, 700);

  // Side-by-side lips
  const boxW = 450, boxH = 300, gap = 60, top = 270;
  const left = (W - (boxW * 2 + gap)) / 2;
  drawCover(ctx, look, left, top, boxW, boxH);
  drawCover(ctx, match, left + boxW + gap, top, boxW, boxH);
  ctx.font = `600 34px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = "center";
  ctx.fillText("The look on me", left + boxW / 2, top + boxH + 52);
  ctx.fillText(`My $${f.price} match`, left + boxW * 1.5 + gap, top + boxH + 52);

  centered(ctx, priceHeadline(f), 790, 120, FG, 900);
  const line = priceLine(f);
  if (line) centered(ctx, line, 850, 40, MUTED, 600);
  centered(ctx, `${f.score}% match on my lips`, 920, 50, ACCENT, 800);
  centered(ctx, f.shade, 990, 46, FG, 700);
  centered(ctx, f.brand, 1050, 36, MUTED, 500);
  let y = 1130;
  if (f.premiumPrice && f.trueDupe) {
    centered(ctx, `✓ Just as gorgeous on me as the $${f.premiumPrice} one 💅`, y, 36, OK, 700);
    y += 60;
  }
  const finish = finishLine(f);
  if (finish) centered(ctx, finish, y, 32, MUTED, 600);

  ctx.fillStyle = "#2A2A35";
  ctx.fillRect(0, H - 110, W, 110);
  centered(ctx, "Proven on my own lips · Built with the YouCam API", H - 45, 30, MUTED, 500);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the image"))), "image/png"));
}
