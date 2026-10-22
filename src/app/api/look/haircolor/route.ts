// POST { fileId, lookFileId, base: "ref" | "src" | "none", productIds } -> hair dye try-ons (1 unit each, cached).

import { NextResponse } from "next/server";
import { MAX_HAIR_DYES_PER_REQUEST, tryOnHairDyes, type HairBase } from "@/lib/look-session";
import { errorResponse } from "../errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { fileId, lookFileId, base, productIds } = (await req.json()) as { fileId?: string; lookFileId?: string; base?: HairBase; productIds?: string[] };
    if (!fileId || !lookFileId || !["ref", "src", "none"].includes(base ?? "") || !Array.isArray(productIds) || !productIds.length) {
      return NextResponse.json({ error: "fileId, lookFileId, base (ref, src or none) and productIds are required." }, { status: 400 });
    }
    if (productIds.length > MAX_HAIR_DYES_PER_REQUEST) {
      return NextResponse.json({ error: `At most ${MAX_HAIR_DYES_PER_REQUEST} hair colors per request.` }, { status: 400 });
    }
    return NextResponse.json({ results: await tryOnHairDyes(fileId, lookFileId, base as HairBase, productIds) });
  } catch (err) {
    return errorResponse(err);
  }
}
