// POST { fileId, productIds } -> blush try-on images on the selfie (1 unit each, cached).

import { NextResponse } from "next/server";
import { MAX_BLUSH_PER_REQUEST, tryOnBlushes } from "@/lib/look-session";
import { errorResponse } from "../errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { fileId, productIds } = (await req.json()) as { fileId?: string; productIds?: string[] };
    if (!fileId || !Array.isArray(productIds) || !productIds.length) {
      return NextResponse.json({ error: "fileId and productIds are required." }, { status: 400 });
    }
    if (productIds.length > MAX_BLUSH_PER_REQUEST) {
      return NextResponse.json({ error: `At most ${MAX_BLUSH_PER_REQUEST} blushes per request.` }, { status: 400 });
    }
    return NextResponse.json({ results: await tryOnBlushes(fileId, productIds) });
  } catch (err) {
    return errorResponse(err);
  }
}
