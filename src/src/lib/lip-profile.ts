"use client";
// Saved lip profiles, kept only in this browser (localStorage). A profile is
// three numbers plus a count and a date. No photo is stored. Profiles are keyed
// by a fingerprint of the selfie, so a different selfie starts fresh.

import type { LipProfile } from "@/lib/lips/plan";

const PREFIX = "stl.lipProfile.";

/** Short SHA-256 fingerprint of the selfie image (data URL). */
export async function selfieFingerprint(selfieDataUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(selfieDataUrl);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function loadProfile(key: string): LipProfile | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    const p = raw ? (JSON.parse(raw) as LipProfile) : null;
    return p && typeof p.looks === "number" && p.shift ? p : null;
  } catch {
    return null; // storage blocked (private mode) or corrupt: just work without a profile
  }
}

export function saveProfile(key: string, profile: LipProfile): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function forgetProfile(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing stored */
  }
}
