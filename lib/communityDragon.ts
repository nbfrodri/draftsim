import type { Champion, Lane } from "./types";
import { MERAKI_POSITION_TO_LANE } from "./lanes";
import { getMetaTiers } from "./championMeta";

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

// Lanes the local CHAMPION_META knows about for this alias. New champion
// releases (e.g. Zaahen at patch 25.23) tend to land in our hand-curated
// meta data days BEFORE Meraki's positions feed catches up. Without this
// fallback, those champions would show empty `lanes`, which downstream
// causes:
//   • ChampionGrid filters them out of pick selection.
//   • TierListView / MetaEditor hide them.
//   • Draft engine can't auto-assign their role.
//   • AI's bestLaneTierValue scores them as "no open lane" and rejects.
// Unioning with our own meta data gives them lanes immediately and the
// union becomes a no-op once Meraki ships their positions.
const ALL_LANES: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

function lanesFromMeta(alias: string): Lane[] {
  const tiers = getMetaTiers(alias);
  const out: Lane[] = [];
  for (const lane of ALL_LANES) {
    if (tiers[lane] != null) out.push(lane);
  }
  return out;
}

function unionLanes(a: Lane[], b: Lane[]): Lane[] {
  const set = new Set<Lane>([...a, ...b]);
  // Preserve the canonical positional order (top → jg → mid → bot → sup).
  return ALL_LANES.filter((l) => set.has(l));
}

// ─── Pending-release fallback ──────────────────────────────────────────────
// CommunityDragon's `champion-summary.json` lags Riot patches by a few hours
// to a couple of days for brand-new releases. Until they ship the entry, the
// champion is invisible to our app — they don't appear in the pick grid,
// the AI won't draft them, etc.
//
// This list defines synthetic Champion entries for known-pending releases.
// At fetch time we union them with CDragon's response, deduping by alias.
// As soon as CDragon ships the real entry, the synthetic is dropped (the
// real one wins because it has a proper icon URL).
//
// To remove an entry: delete the row once CDragon has shipped it. Leaving
// it in is harmless (deduped by alias) but adds clutter.

interface PendingChampion {
  id: number; // best-guess Riot ID; falls back to placeholder icon if wrong
  name: string;
  alias: string;
  roles: string[];
  lanes: Lane[];
}

const PENDING_RELEASES: ReadonlyArray<PendingChampion> = [
  {
    // Zaahen — released patch 25.23 (Darkin top/jg fighter). CDragon as of
    // this writing has not shipped the entry; once they do, this row can
    // be deleted (or left — it's a no-op once aliases match).
    id: 920,
    name: "Zaahen",
    alias: "Zaahen",
    roles: ["Fighter"],
    lanes: ["top", "jungle"],
  },
];

// Cross-runtime base64 — in browser bundles `Buffer` doesn't exist; in
// Node it does. Try Buffer first (cheaper for non-ASCII) and fall back
// to `btoa` over a UTF-16-safe pre-encoding.
function toBase64(s: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(s, "utf-8").toString("base64");
  }
  // SVG content is ASCII-safe, so direct btoa works.
  return globalThis.btoa(s);
}

// Lightweight placeholder icon for synthetic entries — a simple gold-on-
// dark SVG with the champion's first letter. Embedded as a data URL so it
// never 404s. Used for pending-release champions until CDragon ships the
// real icon.
function placeholderIconFor(name: string): string {
  const initial = (name[0] ?? "?").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#1a1a1f"/><rect x="2" y="2" width="60" height="60" fill="none" stroke="#c89b3c" stroke-width="2"/><text x="32" y="42" font-family="serif" font-size="32" fill="#c89b3c" text-anchor="middle" font-weight="bold">${initial}</text></svg>`;
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

function injectPendingReleases(fetched: Champion[]): Champion[] {
  const seen = new Set(fetched.map((c) => c.alias));
  const synthetic: Champion[] = [];
  for (const p of PENDING_RELEASES) {
    if (seen.has(p.alias)) continue;
    synthetic.push({
      id: p.id,
      name: p.name,
      alias: p.alias,
      roles: p.roles,
      // Placeholder icon — CDragon's icon path requires the real Riot ID
      // which we don't know until they ship it. The placeholder is a
      // styled "Z" letter that matches the rift-gold theme.
      iconUrl: placeholderIconFor(p.name),
      lanes: unionLanes(p.lanes, lanesFromMeta(p.alias)),
    });
  }
  if (synthetic.length === 0) return fetched;
  // Re-sort to keep the merged list alphabetical by name.
  return [...fetched, ...synthetic].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
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

  const fetched = raw
    .filter((c) => c.id > 0) // drop the "None" sentinel (id -1)
    .filter((c) => !c.alias.startsWith("Ruby_")) // drop Doom Bot variants
    .map((c) => ({
      id: c.id,
      name: c.name,
      alias: c.alias,
      roles: c.roles ?? [],
      iconUrl: iconUrlFor(c.id),
      lanes: unionLanes(lanesMap[c.id] ?? [], lanesFromMeta(c.alias)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return injectPendingReleases(fetched);
}
