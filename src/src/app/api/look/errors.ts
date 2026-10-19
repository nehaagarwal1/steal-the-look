// Shared error -> HTTP response mapping for the look API routes.

import { NextResponse } from "next/server";
import { BudgetExceededError } from "@/lib/units";
import { explainYouCamError, isOutOfCredits, YouCamError } from "@/lib/youcam";

export function errorResponse(err: unknown) {
  if (err instanceof BudgetExceededError || isOutOfCredits(err)) {
    return NextResponse.json({ error: "Live try-on is paused: this demo has used its API budget. Please try again later." }, { status: 503 });
  }
  if (err instanceof YouCamError && err.code?.startsWith("error_")) {
    // Photo problems the shopper can fix (no face, eyes covered, face too small...).
    return NextResponse.json({ error: explainYouCamError(err), fixable: true }, { status: 422 });
  }
  if (err instanceof Error && err.message.startsWith("No recorded demo session")) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
