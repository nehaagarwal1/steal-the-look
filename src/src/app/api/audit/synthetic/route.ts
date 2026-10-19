// POST { presetId } or { person } -> one AI-generated test face (YouCam AI Image Generator, 1 unit).

import { NextResponse } from "next/server";
import { generateSyntheticFace, isDemoMode } from "@/lib/look-session";
import { FACE_PRESETS } from "@/lib/synthetic-faces";
import { errorResponse } from "../../look/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (isDemoMode()) return NextResponse.json({ error: "Generating faces is off in demo mode." }, { status: 409 });
    const { presetId, person } = (await req.json()) as { presetId?: string; person?: string };
    const preset = FACE_PRESETS.find((p) => p.id === presetId);
    const who = preset?.description ?? person?.trim();
    if (!who) return NextResponse.json({ error: "Choose a preset or describe the person." }, { status: 400 });
    if (who.length > 300) return NextResponse.json({ error: "Keep the description under 300 characters." }, { status: 400 });
    return NextResponse.json({ ...(await generateSyntheticFace(who, preset?.id ?? "custom")), presetId: preset?.id ?? "custom" });
  } catch (err) {
    return errorResponse(err);
  }
}
