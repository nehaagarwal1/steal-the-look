// POST { fileId, productIds } -> brow color try-ons on the selfie (1 unit each, cached).

import { NextResponse } from "next/server";
import { tryOnBrows } from "@/lib/look-session";
import { errorResponse } from "../errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { fileId, productIds } = (await req.json()) as { fileId?: string; productIds?: string[] };
    if (!fileId || !Array.isArray(productIds) || !productIds.length || productIds.length > 2) {
      return NextResponse.json({ error: "fileId and 1-2 productIds are required." }, { status: 400 });
    }
    return NextResponse.json({ results: await tryOnBrows(fileId, productIds) });
  } catch (err) {
    return errorResponse(err);
  }
}
