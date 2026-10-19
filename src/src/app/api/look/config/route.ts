// GET -> whether the app is replaying a recorded demo session, which shades it has, and whether recording is on.

import { NextResponse } from "next/server";
import { auditRecordingOn, isDemoMode, readDemoManifest } from "@/lib/look-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const demo = isDemoMode();
  const m = demo ? readDemoManifest() : null;
  return NextResponse.json({ demo, demoReady: !!m?.transfer, demoProducts: m ? Object.keys(m.tryons) : [], recording: auditRecordingOn() });
}
