// POST { report } -> saves a finished audit report for demo mode (only when RECORD_DEMO=1).
// Reports contain numbers and anonymous face labels only; anything image-like is rejected.

import { NextResponse } from "next/server";
import { auditRecordingOn, saveAuditReport } from "@/lib/look-session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!auditRecordingOn()) {
    return NextResponse.json({ error: "Saving a demo report needs RECORD_DEMO=1 and DEMO_MODE=0." }, { status: 409 });
  }
  const text = await req.text();
  if (text.length > 200_000) return NextResponse.json({ error: "Report is too large." }, { status: 413 });
  if (/data:image|base64/.test(text)) return NextResponse.json({ error: "Reports must not contain images." }, { status: 400 });
  try {
    const { report } = JSON.parse(text) as { report?: unknown };
    if (!report || typeof report !== "object") throw new Error("missing report");
    saveAuditReport(JSON.stringify(report, null, 2));
    return NextResponse.json({ saved: "/demo/audit/report.json" });
  } catch {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }
}
