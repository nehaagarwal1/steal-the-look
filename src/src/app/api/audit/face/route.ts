// POST multipart { face: File, source: "real" | "synthetic", consent: "yes" } -> uploads one test face for a Dupe Audit.
// Real volunteers need consent; synthetic (AI-generated) faces show no real person.

import { NextResponse } from "next/server";
import { isDemoMode, uploadAuditFace } from "@/lib/look-session";
import { errorResponse } from "../../look/errors";

export const runtime = "nodejs";
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    if (isDemoMode()) {
      return NextResponse.json({ error: "Live audits are off in demo mode. The saved audit report is shown instead." }, { status: 409 });
    }
    const form = await req.formData();
    const face = form.get("face");
    if (!(face instanceof File)) return NextResponse.json({ error: "No face photo." }, { status: 400 });
    // Real people need consent; faces declared synthetic (AI-generated, no real person) don't.
    const synthetic = form.get("source") === "synthetic";
    if (!synthetic && form.get("consent") !== "yes") {
      return NextResponse.json({ error: "Confirm that each real volunteer agreed to be part of the audit." }, { status: 400 });
    }
    if (face.size > MAX_BYTES) return NextResponse.json({ error: "Photos must be under 10 MB." }, { status: 400 });
    return NextResponse.json(await uploadAuditFace(Buffer.from(await face.arrayBuffer())));
  } catch (err) {
    return errorResponse(err);
  }
}
