import type { Champion, Lane } from "./types";
import { MERAKI_POSITION_TO_LANE } from "./lanes";

const CHAMPIONS_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json";
const MERAKI_URL =
  "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json";
const DAY = 60 * 60 * 24;

interface RawChampion {
  id: number;
  name: string;
  alias: string;
  roles: string[];
  squarePortraitPath?: string;
}

interface MerakiChampion {
  id: number;
  key: string;
  positions?: string[];
}

function iconUrlFor(id: number): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;
}

// Meraki exposes a curated `positions` array per champion — it only lists
// lanes the champion is actually played in (unlike u.gg's primary-roles which
// ranks every lane and produces false positives for pure specialists).
// The raw response is ~17MB which exceeds Next's 2MB data-cache limit; this
// surfaces as a build-time warning but is fine in practice since the server
// component wrapping this call is statically regenerated once per day (ISR).
async function fetchLanesFromMeraki(): Promise<Record<number, Lane[]>> {
  const res = await fetch(MERAKI_URL, { next: { revalidate: DAY } });
  if (!res.ok) throw new Error(`Meraki fetch failed: ${res.status}`);
  const raw = (await res.json()) as Record<string, MerakiChampion>;
  const out: Record<number, Lane[]> = {};
  for (const entry of Object.values(raw)) {
    if (typeof entry?.id !== "number") continue;
    const lanes = (entry.positions ?? [])
      .map((p) => MERAKI_POSITION_TO_LANE[p])
      .filter((l): l is Lane => !!l);
    out[entry.id] = lanes;
  }
  return out;
}

export async function fetchChampions(): Promise<Champion[]> {
  const [raw, lanesMap] = await Promise.all([
    fetch(CHAMPIONS_URL, { next: { revalidate: DAY } }).then((r) => {
      if (!r.ok) throw new Error(`CommunityDragon fetch failed: ${r.status}`);
      return r.json() as Promise<RawChampion[]>;
    }),
    fetchLanesFromMeraki().catch((e) => {
      console.warn("[draftsim] Meraki lane fetch failed:", e);
      return {} as Record<number, Lane[]>;
    }),
  ]);

  return raw
    .filter((c) => c.id > 0) // drop the "None" sentinel (id -1)
    .filter((c) => !c.alias.startsWith("Ruby_")) // drop Doom Bot variants
    .map((c) => ({
      id: c.id,
      name: c.name,
      alias: c.alias,
      roles: c.roles ?? [],
      iconUrl: iconUrlFor(c.id),
      lanes: lanesMap[c.id] ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
