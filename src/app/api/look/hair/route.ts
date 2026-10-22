// POST { fileId, lookFileId, color: "ref" | "src" } -> the look's hairstyle on the selfie (2 units, cached).

import { NextResponse } from "next/server";
import { tryOnHair, type HairColorMode } from "@/lib/look-session";
import { errorResponse } from "../errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { fileId, lookFileId, color } = (await req.json()) as { fileId?: string; lookFileId?: string; color?: HairColorMode };
    if (!fileId || !lookFileId || (color !== "ref" && color !== "src")) {
      return NextResponse.json({ error: "fileId, lookFileId and color (ref or src) are required." }, { status: 400 });
    }
    return NextResponse.json({ image: await tryOnHair(fileId, lookFileId, color) });
  } catch (err) {
    return errorResponse(err);
  }
}
