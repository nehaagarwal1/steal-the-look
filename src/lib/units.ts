// YouCam unit ledger and budget guard. Every live task checks the budget
// before it starts and records its cost when it succeeds, so neither the app
// nor the week-1 CLI can drain the account by accident.
//
// Costs measured with `npm run week1 -- costs` (2026-10-12):
//   skin-tone-analysis 20 · makeup-vto 1 · cloth-v4 2 · mu-transfer 2 · text-to-image/youcam 1   (units per result image)

import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const UNIT_COSTS: Record<string, number> = {
  "skin-tone-analysis": 20,
  "makeup-vto": 1,
  "cloth-v4": 2,
  "mu-transfer": 2,
  "text-to-image/youcam": 1,
  "hair-color": 1,
  "hair-transfer": 2, // AI Hairstyle Generator v2.1 (custom reference), per the YouCam docs
};

const LEDGER = path.join(process.cwd(), ".data", "units.json");

type Ledger = { spent: number; log: { at: string; feature: string; units: number }[] };

export class BudgetExceededError extends Error {
  constructor(public feature: string, public remaining: number) {
    super(`Unit budget reached: ${feature} needs ${UNIT_COSTS[feature] ?? "?"} units, ${remaining} left. Raise UNIT_BUDGET in .env.local if intended.`);
  }
}

function read(): Ledger {
  return existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, "utf8")) as Ledger) : { spent: 0, log: [] };
}

/** Budget this machine may spend in total (default 300 so a stray loop can't burn everything). */
export function budget(): number {
  return Number(process.env.UNIT_BUDGET ?? 300);
}

export function unitsSpent(): number {
  return read().spent;
}

export function unitsRemaining(): number {
  return budget() - unitsSpent();
}

export function assertCanSpend(feature: string): void {
  const cost = UNIT_COSTS[feature] ?? 0;
  const remaining = unitsRemaining();
  if (cost > remaining) throw new BudgetExceededError(feature, remaining);
}

export function recordSpend(feature: string): void {
  const units = UNIT_COSTS[feature] ?? 0;
  const ledger = read();
  ledger.spent += units;
  ledger.log.push({ at: new Date().toISOString(), feature, units });
  mkdirSync(path.dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
}
