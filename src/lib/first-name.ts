"use client";
// Optional first name for the greeting ("Hey Neha ✨"), kept only in this browser.
// Never sent to the server or YouCam, and never put on the share card.

const KEY = "ps.firstName";
export const MAX_NAME_LENGTH = 30;

/** Trimmed, single-spaced, at most 30 characters, letters/marks/spaces/hyphens/apostrophes only. */
export function cleanFirstName(raw: string): string {
  return raw.replace(/[^\p{L}\p{M}' -]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

/** "Hey Neha ✨" or "Hey you ✨". */
export const greetingName = (name: string) => (name ? name : "you");

export function loadFirstName(): string {
  try {
    return cleanFirstName(localStorage.getItem(KEY) ?? "");
  } catch {
    return ""; // storage blocked (private mode): just greet without a name
  }
}

export function saveFirstName(name: string): void {
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch {
    /* not stored; the greeting still works for this visit */
  }
}
