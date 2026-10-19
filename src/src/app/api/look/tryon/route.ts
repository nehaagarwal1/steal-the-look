// POST { fileId, productIds: string[] } -> try-on images (1 unit each, cached per selfie + product).

import { NextResponse } from "next/server";
import { MAX_TRYONS_PER_REQUEST, tryOnProducts } from "@/lib/look-session";
import { errorResponse } from "../errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { fileId, productIds } = (await req.json()) as { fileId?: string; productIds?: string[] };
    if (!fileId || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: "fileId and productIds are required." }, { status: 400 });
    }
    if (productIds.length > MAX_TRYONS_PER_REQUEST) {
      return NextResponse.json({ error: `At most ${MAX_TRYONS_PER_REQUEST} shades per request.` }, { status: 400 });
    }
    return NextResponse.json({ results: await tryOnProducts(fileId, productIds) });
  } catch (err) {
    return errorResponse(err);
  }
}
