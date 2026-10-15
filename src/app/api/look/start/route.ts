// POST multipart { selfie: File, look: File } -> selfie + Makeup Transfer result (2 units, cached).

import { NextResponse } from "next/server";
import { isDemoMode, startSession } from "@/lib/look-session";
import { errorResponse } from "../errors";

export const runtime = "nodejs";
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    if (isDemoMode()) return NextResponse.json(await startSession(Buffer.alloc(0), Buffer.alloc(0)));

    const form = await req.formData();
    const selfie = form.get("selfie"), look = form.get("look");
    if (!(selfie instanceof File) || !(look instanceof File)) {
      return NextResponse.json({ error: "Please add both your selfie and a look photo." }, { status: 400 });
    }
    if (form.get("consent") !== "yes") {
      // The look photo can show another person; it is only uploaded with the shopper's confirmation.
      return NextResponse.json({ error: "Please confirm you have permission to use the look photo." }, { status: 400 });
    }
    if (selfie.size > MAX_BYTES || look.size > MAX_BYTES) {
      return NextResponse.json({ error: "Photos must be under 10 MB." }, { status: 400 });
    }
    const result = await startSession(Buffer.from(await selfie.arrayBuffer()), Buffer.from(await look.arrayBuffer()));
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
