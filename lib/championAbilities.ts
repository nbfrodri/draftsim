// Champion ability profile loaded from the Meraki refresh. Used by the
// combat sim to model real per-champion lockdown windows and burst
// timings instead of archetype-default proxies.
//
// Refresh cadence: run `npm run refresh-data` whenever Riot ships a patch.
// The JSON file ships with the repo; ~150 champion abilities ≈ 30KB.

import abilitiesData from "./data/abilities.json";
import {
  sanitizeBoolean,
  sanitizeNumber,
  sanitizeString,
  SanitizationLog,
} from "./dataValidation";

export interface AbilityProfile {
  alias: string;
  // Maximum duration of any hard CC in the champion's kit (seconds).
  // 1.5s = Malphite R / Vayne Condemn; 1.0s = Pantheon W / Annie passive.
  // 0 = soft CC only (slows, silences without stun).
  hardCCDuration: number;
  // Ult cooldown at rank 1 (seconds). Drives "how often does this comp
  // get to use their wombo": 80s ult vs 180s ult is a meaningful gap
  // across multiple teamfight windows.
  ultCooldown: number;
  // Cast time of the ult in seconds. 0 = instant (Annie R, Sett R), 1.5
  // = Karthus R / Vladimir R / Tahm Kench eat. Long cast times can be
  // interrupted = harder to land.
  ultCastTime: number;
  // Champion has reset / refresh / multi-charge mechanics (Akali R recharge,
  // Khazix R isolated reset, Riven Q/W/E charges). Resets effectively
  // shorten cooldowns in extended fights.
  hasResets: boolean;
  // Approximate window in seconds where the champion dumps the bulk of
  // their damage. Marksmen: ~8s sustained; assassins: ~2.5s burst.
  burstWindowSeconds: number;
}

// Validate and sanitize all ability entries at module load.
// Malformed numeric/boolean fields are coerced to safe defaults; a single
// aggregated warning is emitted so issues are visible without crashing.
function loadAndSanitizeAbilities(): Readonly<Record<string, AbilityProfile>> {
  const raw = abilitiesData as Record<string, unknown>;
  const log = new SanitizationLog();
  const sanitized: Record<string, AbilityProfile> = {};

  for (const [key, entry] of Object.entries(raw)) {
    const p = `abilities.${key}`;
    const e = (entry ?? {}) as Record<string, unknown>;
    sanitized[key] = {
      alias: sanitizeString(e["alias"], `${p}.alias`, log, key),
      hardCCDuration: sanitizeNumber(e["hardCCDuration"], `${p}.hardCCDuration`, log),
      ultCooldown: sanitizeNumber(e["ultCooldown"], `${p}.ultCooldown`, log, 90),
      ultCastTime: sanitizeNumber(e["ultCastTime"], `${p}.ultCastTime`, log),
      hasResets: sanitizeBoolean(e["hasResets"], `${p}.hasResets`, log),
      burstWindowSeconds: sanitizeNumber(e["burstWindowSeconds"], `${p}.burstWindowSeconds`, log, 4),
    };
  }

  log.flush("abilities.json");
  return sanitized;
}

const ABILITIES: Readonly<Record<string, AbilityProfile>> = loadAndSanitizeAbilities();

// Lookup with safe fallback. When a champion is missing from the data
// (new release, fetch failed), returns a neutral profile so callers don't
// have to null-check everywhere.
export function getAbilityProfile(alias: string): AbilityProfile {
  const found = ABILITIES[alias];
  if (found) return found;
  return {
    alias,
    hardCCDuration: 0,
    ultCooldown: 90,
    ultCastTime: 0,
    hasResets: false,
    burstWindowSeconds: 4,
  };
}

// Convenience: total hard CC duration across a team's locked picks. Used
// in combat sim to model "side with more lockdown wins fight initiation".
export function teamLockdownTotal(picks: ReadonlyArray<string | null>): number {
  let total = 0;
  for (const alias of picks) {
    if (!alias) continue;
    total += getAbilityProfile(alias).hardCCDuration;
  }
  return total;
}
