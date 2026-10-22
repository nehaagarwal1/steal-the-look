// POST { fileId, shades: [{ key, hex, texture }] } -> try-on images on one audit face (1 unit each, cached).

import { NextResponse } from "next/server";
import { isDemoMode, tryOnAuditShades, type AuditShadeInput } from "@/lib/look-session";
import { errorResponse } from "../../look/errors";

export const runtime = "nodejs";
const MAX_SHADES = 6;
const TEXTURES = new Set(["matte", "gloss", "satin", "sheer", "shimmer", "metallic", "holographic"]);

export async function POST(req: Request) {
  try {
    if (isDemoMode()) return NextResponse.json({ error: "Live audits are off in demo mode." }, { status: 409 });
    const { fileId, shades } = (await req.json()) as { fileId?: string; shades?: AuditShadeInput[] };
    if (!fileId || !Array.isArray(shades) || !shades.length) {
      return NextResponse.json({ error: "fileId and shades are required." }, { status: 400 });
    }
    if (shades.length > MAX_SHADES) return NextResponse.json({ error: `At most ${MAX_SHADES} shades per request.` }, { status: 400 });
    const bad = shades.find((s) => typeof s.key !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(s.hex) || !TEXTURES.has(s.texture));
    if (bad) return NextResponse.json({ error: `Invalid shade: ${JSON.stringify(bad).slice(0, 120)}` }, { status: 400 });
    return NextResponse.json({ results: await tryOnAuditShades(fileId, shades) });
  } catch (err) {
    return errorResponse(err);
  }
}
