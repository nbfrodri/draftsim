"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import { deriveStar, randomizeTiersForStar, PLAYER_TIERS } from "@/lib/players";
import type {
  AIDifficulty,
  PlayerTier,
  SeriesFormat,
  VariancePreset,
} from "@/lib/types";
import type { TournamentFormat } from "@/lib/tournament";
import {
  DEFAULT_LEAGUE_CONFIG,
  DEFAULT_INTL_CONFIGS,
  INTL_IDS,
  SELECT_CLS,
  LeagueConfigCard,
  IntlConfigCard,
} from "./season/configCards";
import {
  generateSeasonTeams,
  rerollTeamIdentity,
} from "@/lib/season/teamGen";
import {
  BUNDLED_TEAMS,
  fetchRealTeams,
  type RealTeam,
} from "@/lib/season/realTeams";
import { overlayNames, realOrKeep, realCoachForTeam } from "@/lib/season/playerNames";
import {
  INTERNATIONAL_LABELS,
  SPLIT_LABELS,
  LEAGUE_IDS,
  LEAGUE_NAMES,
  type InternationalId,
  type LeagueId,
  type SeasonConfig,
  type SeasonIntlConfig,
  type SeasonLeagueConfig,
  type SeasonTeam,
} from "@/lib/season/types";
import MetaPanel from "./MetaPanel";
import TeamIcon from "./TeamIcon";

// Season creation: name, per-league (or shared) split formats, meta
// behavior, and the 60 randomized-but-editable team identities.

interface Props {
  onCancel: () => void;
}

export default function SeasonSetup({ onCancel }: Props) {
  const champions = useDraftStore((s) => s.champions);
  const startSeason = useDraftStore((s) => s.startSeason);
  // When the creator was opened from the Realities hub, players carry an age
  // (a continuous timeline ages them year to year) — so expose age editing too.
  const isReality = useDraftStore((s) => s.pendingReality != null);

  const [name, setName] = useState("My Season");
  const [shared, setShared] = useState(true);
  const [leagueConfigs, setLeagueConfigs] = useState<
    Record<LeagueId, SeasonLeagueConfig>
  >(() => {
    const out = {} as Record<LeagueId, SeasonLeagueConfig>;
    for (const l of LEAGUE_IDS) out[l] = { ...DEFAULT_LEAGUE_CONFIG };
    return out;
  });
  const [liveMeta, setLiveMeta] = useState(true);
  const [patchShift, setPatchShift] = useState(true);
  const [fearless, setFearless] = useState(false);
  // Season-realism toggles (default off — opt-in flavor).
  const [formDrift, setFormDrift] = useState(false);
  const [playerDevelopment, setPlayerDevelopment] = useState(false);
  const [playerTransfers, setPlayerTransfers] = useState(false);
  const [metaAdaptability, setMetaAdaptability] = useState(false);
  const [clutchFactor, setClutchFactor] = useState(false);
  const [regionTides, setRegionTides] = useState(false);
  // Match-variance preset; "off" ⇒ classic bias model (field omitted).
  const [variancePreset, setVariancePreset] = useState<VariancePreset | "off">(
    "off",
  );
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>("normal");
  // International formats: per-event by default (each event has its own
  // canonical shape); "shared" applies the First Stand card to all.
  const [sharedIntl, setSharedIntl] = useState(false);
  const [intlConfigs, setIntlConfigs] = useState<
    Record<InternationalId, SeasonIntlConfig>
  >(() => ({
    "first-stand": { ...DEFAULT_INTL_CONFIGS["first-stand"] },
    msi: { ...DEFAULT_INTL_CONFIGS.msi },
    worlds: { ...DEFAULT_INTL_CONFIGS.worlds },
  }));
  const [teams, setTeams] = useState<SeasonTeam[]>([]);
  const [controlledTeamId, setControlledTeamId] = useState<string | null>(
    null,
  );
  const [openLeague, setOpenLeague] = useState<LeagueId | null>(null);
  // Team whose per-player / coach ratings are being fine-tuned (one at a time).
  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  // Starting Meta is bulky — collapsed by default so the creator opens on
  // the parts most users change (formats + teams).
  const [metaOpen, setMetaOpen] = useState(false);
  const [realNames, setRealNames] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");

  // Generate the initial 60 teams once champions are loaded.
  useEffect(() => {
    if (champions.length === 0 || teams.length > 0) return;
    setTeams(generateSeasonTeams(champions));
  }, [champions, teams.length]);

  // Reality mode: stamp a starting age on any player missing one, so ages are
  // visible and editable up front (re-rolls produce age-less players too). The
  // guard returns the same array once all have ages, so this settles in one pass.
  useEffect(() => {
    if (!isReality) return;
    setTeams((prev) => {
      if (prev.every((t) => t.players.every((p) => p.age != null))) return prev;
      return prev.map((t) => ({
        ...t,
        players: t.players.map((p) =>
          p.age != null ? p : { ...p, age: 18 + Math.floor(Math.random() * 8) },
        ),
      }));
    });
  }, [isReality, teams]);

  const byLeague = useMemo(() => {
    const map = new Map<LeagueId, SeasonTeam[]>();
    for (const l of LEAGUE_IDS) map.set(l, []);
    for (const t of teams) map.get(t.leagueId)?.push(t);
    return map;
  }, [teams]);

  const updateConfig = (
    league: LeagueId,
    patch: Partial<SeasonLeagueConfig>,
  ) => {
    setLeagueConfigs((prev) => ({
      ...prev,
      [league]: { ...prev[league], ...patch },
    }));
  };

  const updateIntlConfig = (
    event: InternationalId,
    patch: Partial<SeasonIntlConfig>,
  ) => {
    setIntlConfigs((prev) => ({
      ...prev,
      [event]: { ...prev[event], ...patch },
    }));
  };

  const rerollOne = (teamId: string) => {
    setTeams((prev) => {
      const team = prev.find((t) => t.id === teamId);
      if (!team) return prev;
      const rerolled = rerollTeamIdentity(team, prev);
      return prev.map((t) => (t.id === teamId ? rerolled : t));
    });
  };

  const rerollLeague = (league: LeagueId) => {
    setTeams((prev) => {
      let next = [...prev];
      for (const t of prev) {
        if (t.leagueId !== league) continue;
        const rerolled = rerollTeamIdentity(
          next.find((x) => x.id === t.id)!,
          next,
        );
        next = next.map((x) => (x.id === t.id ? rerolled : x));
      }
      return next;
    });
  };

  const rerollAll = () => {
    setTeams(generateSeasonTeams(champions));
    setControlledTeamId(null);
    setRealNames("idle");
  };

  // Rename teams league-by-league from a real-teams table. Teams keep
  // their ids, colors, icons, rosters, and personalities; each named team
  // also picks up that team's logo. Leagues with fewer than 10 entries
  // keep generated names (and no logo) for the remainder.
  const applyTeamsByLeague = (
    teamsByLeague: Partial<Record<LeagueId, RealTeam[]>>,
  ) => {
    setTeams((prev) => {
      const used: Partial<Record<LeagueId, number>> = {};
      return prev.map((t) => {
        const idx = used[t.leagueId] ?? 0;
        used[t.leagueId] = idx + 1;
        const real = teamsByLeague[t.leagueId]?.[idx];
        if (!real) return t;
        const coachName = realCoachForTeam(real.name);
        return {
          ...t,
          name: real.name,
          logoUrl: real.logoUrl,
          // Prefer the live-fetched roster; fall back to the bundled
          // snapshot's handles offline. Either way, lanes without a real
          // handle keep their generated one.
          players: real.players
            ? overlayNames(t.players, real.players)
            : realOrKeep(t.players, real.name),
          // Real head-coach name where we have it (keeps the coach's traits).
          ...(coachName && t.coach ? { coach: { ...t.coach, name: coachName } } : {}),
        };
      });
    });
  };

  // Instant: the bundled offline snapshot of real pro teams.
  const applyBundledNames = () => {
    applyTeamsByLeague(BUNDLED_TEAMS);
    setRealNames("done");
  };

  // Live: real teams per region from the public LoL Esports API, falling
  // back to the bundled snapshot when the API is unreachable.
  const applyRealNames = async () => {
    setRealNames("loading");
    try {
      applyTeamsByLeague(await fetchRealTeams(AbortSignal.timeout(20_000)));
      setRealNames("done");
    } catch {
      applyTeamsByLeague(BUNDLED_TEAMS);
      setRealNames("error");
    }
  };

  // Set a team's strength (1-5 stars): regenerate the roster's player
  // tiers to match the target star while keeping each player's champion
  // pools (comfort picks) intact.
  const setTeamStar = (teamId: string, star: number) => {
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const tiers = randomizeTiersForStar(star);
        return {
          ...t,
          players: t.players.map((p, i) => ({ ...p, tier: tiers[i] })),
        };
      }),
    );
  };

  // Fine-tune one player's skill tier. The team's star badge re-derives live
  // from the roster, so editing here can pull a team off its preset star tier.
  const setPlayerTier = (teamId: string, lane: string, tier: PlayerTier) => {
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? {
              ...t,
              players: t.players.map((p) =>
                p.lane === lane ? { ...p, tier } : p,
              ),
            }
          : t,
      ),
    );
  };

  // Fine-tune a player's starting age (reality mode). Clamped to a realistic
  // pro range; the timeline ages them from here.
  const setPlayerAge = (teamId: string, lane: string, age: number) => {
    const clamped = Math.max(16, Math.min(40, age));
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? {
              ...t,
              players: t.players.map((p) =>
                p.lane === lane ? { ...p, age: clamped } : p,
              ),
            }
          : t,
      ),
    );
  };

  // Fine-tune a coach's rating (1..5 → drives draft AI difficulty).
  const setCoachRating = (teamId: string, rating: number) => {
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId && t.coach
          ? { ...t, coach: { ...t.coach, rating } }
          : t,
      ),
    );
  };

  const handleStart = () => {
    if (teams.length === 0) return;
    const config: SeasonConfig = {
      name,
      sharedLeagueConfig: shared,
      leagueConfigs: shared
        ? (Object.fromEntries(
            LEAGUE_IDS.map((l) => [l, { ...leagueConfigs.LCK }]),
          ) as Record<LeagueId, SeasonLeagueConfig>)
        : leagueConfigs,
      // Shared mode: the First Stand card is the master copy for all
      // three events (mirrors the league shared slot).
      intlConfigs: sharedIntl
        ? (Object.fromEntries(
            INTL_IDS.map((e) => [e, { ...intlConfigs["first-stand"] }]),
          ) as Record<InternationalId, SeasonIntlConfig>)
        : intlConfigs,
      liveMeta,
      patchShift,
      fearless,
      timerEnabled,
      aiDifficulty,
      controlledTeamId,
      // Realism options — only materialize when ON so default seasons
      // serialize byte-identically to pre-feature saves.
      ...(formDrift ? { formDrift: true } : {}),
      ...(playerDevelopment ? { playerDevelopment: true } : {}),
      ...(playerTransfers ? { playerTransfers: true } : {}),
      ...(metaAdaptability ? { metaAdaptability: true } : {}),
      ...(clutchFactor ? { clutchFactor: true } : {}),
      ...(regionTides ? { regionTides: true } : {}),
      ...(variancePreset !== "off" ? { variancePreset } : {}),
    };
    startSeason(config, teams);
  };


  return (
    <div className="min-h-screen px-4 py-10 md:py-14">
      <div className="max-w-4xl mx-auto">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 mb-6 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright transition-colors"
        >
          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8h10" strokeLinecap="round" />
          </svg>
          Main Menu
        </button>

        <div className="text-[10px] uppercase tracking-[0.5em] text-rift-gold/70 mb-2">
          New Season
        </div>
        <h1 className="font-display text-3xl md:text-4xl tracking-[0.12em] text-rift-goldbright mb-2">
          Season Mode
        </h1>
        <p className="text-[11px] md:text-xs text-rift-mutedbright leading-snug mb-6 max-w-2xl">
          A full competitive year across LCK, LPL, LEC, LCS, CBLOL and
          LCP: Winter Split → First Stand (top 2 per league) → Spring
          Split → MSI (top 3, plus the First Stand champion) → Summer
          Split → Worlds. Worlds slots reward the whole season: the
          summer finalists qualify directly, the next two by
          championship points across all splits and internationals (the
          #4 seeds fight through a play-in), and the MSI champion enters
          automatically. The meta evolves all season, momentum carries
          across events, and seeding decides international bracket
          draws.
        </p>

        {/* Calendar preview — the fixed phase flow of every season. */}
        <div className="mb-6 overflow-x-auto">
          <div className="inline-flex items-center gap-1.5 min-w-full">
            {[
              { label: SPLIT_LABELS.winter, kind: "split" as const },
              { label: INTERNATIONAL_LABELS["first-stand"], kind: "intl" as const },
              { label: SPLIT_LABELS.spring, kind: "split" as const },
              { label: INTERNATIONAL_LABELS.msi, kind: "intl" as const },
              { label: SPLIT_LABELS.summer, kind: "split" as const },
              { label: INTERNATIONAL_LABELS.worlds, kind: "intl" as const },
            ].map((phase, i) => (
              <div key={phase.label} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span className="text-rift-gold/30 text-[10px]" aria-hidden>
                    →
                  </span>
                )}
                <span
                  className={`px-2.5 py-1 border text-[8px] md:text-[9px] uppercase tracking-[0.2em] whitespace-nowrap ${
                    phase.kind === "intl"
                      ? "border-rift-gold/55 bg-rift-gold/10 text-rift-goldbright"
                      : "border-rift-line/60 bg-rift-bg/40 text-rift-mutedbright"
                  }`}
                >
                  {phase.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Name */}
        <label className="block mb-5">
          <span className="text-[9px] uppercase tracking-[0.35em] text-rift-muted block mb-1">
            Season Name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full max-w-sm bg-rift-bg/60 border border-rift-line text-rift-goldbright font-display tracking-wider px-3 py-2 outline-none focus:border-rift-gold/60"
          />
        </label>

        {/* League formats */}
        <div className="flex items-center gap-3 mb-2">
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            League Formats
          </div>
          <button
            type="button"
            onClick={() => setShared(!shared)}
            className={`px-2.5 py-1 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              shared
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"
            }`}
          >
            {shared ? "Shared: all leagues alike" : "Per-league configs"}
          </button>
        </div>
        <div className="space-y-2 mb-6">
          {shared ? (
            <LeagueConfigCard
              label="All Leagues"
              cfg={leagueConfigs.LCK}
              onChange={(p) => updateConfig("LCK", p)}
            />
          ) : (
            LEAGUE_IDS.map((l) => (
              <LeagueConfigCard
                key={l}
                label={l}
                cfg={leagueConfigs[l]}
                onChange={(p) => updateConfig(l, p)}
              />
            ))
          )}
        </div>

        {/* International formats */}
        <div className="flex items-center gap-3 mb-2">
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            International Formats
          </div>
          <button
            type="button"
            onClick={() => setSharedIntl(!sharedIntl)}
            className={`px-2.5 py-1 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              sharedIntl
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"
            }`}
          >
            {sharedIntl ? "Shared: all events alike" : "Per-event configs"}
          </button>
        </div>
        <div className="space-y-2 mb-6">
          {sharedIntl ? (
            <IntlConfigCard
              event="shared"
              cfg={intlConfigs["first-stand"]}
              onChange={(p) => updateIntlConfig("first-stand", p)}
            />
          ) : (
            INTL_IDS.map((e) => (
              <IntlConfigCard
                key={e}
                event={e}
                cfg={intlConfigs[e]}
                onChange={(p) => updateIntlConfig(e, p)}
              />
            ))
          )}
        </div>

        {/* Season options */}
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
          Season Options
        </div>
        <div className="flex items-end gap-3 flex-wrap mb-6 border border-rift-line/40 bg-rift-bg/30 p-3">
          <button
            type="button"
            onClick={() => setLiveMeta(!liveMeta)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              liveMeta
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="Champion tiers shift slightly as rounds complete inside every event"
          >
            Live Meta {liveMeta ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setPatchShift(!patchShift)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              patchShift
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="A gentle balance patch between each split nudges a few champion tiers — like real LoL patches, a little, not a teardown"
          >
            Patch Shifts {patchShift ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setFormDrift(!formDrift)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              formDrift
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="Hot/cold form: results nudge a hidden team strength modifier (regressing to the roster baseline), shown as a trending tier badge"
          >
            Team Form {formDrift ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setPlayerDevelopment(!playerDevelopment)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              playerDevelopment
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="Players develop between splits — weaker rosters trend up, peaked ones regress down — so team ratings move across the year"
          >
            Player Dev {playerDevelopment ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setPlayerTransfers(!playerTransfers)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              playerTransfers
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="Between splits a light free-agency window moves standouts up and weak links down — value blends tier, split grades, and champion-pool fit to the current patch"
          >
            Transfers {playerTransfers ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setMetaAdaptability(!metaAdaptability)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              metaAdaptability
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="Adaptable teams gain form on a patch shift, rigid teams lose it (needs Patch Shifts on to matter)"
          >
            Meta Adapt {metaAdaptability ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setClutchFactor(!clutchFactor)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              clutchFactor
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="Teams carry a clutch trait that tilts elimination-round odds, plus within-series momentum for the game leader"
          >
            Clutch {clutchFactor ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setRegionTides(!regionTides)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              regionTides
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="International results raise or lower each region's strength, reordering inter-league seeding (instead of the fixed LCK>LPL>… ranking)"
          >
            Region Tides {regionTides ? "ON" : "OFF"}
          </button>
          {/* Match variance: a single Off/Chalky/Balanced/Chaotic dial over
              upset likelihood (deciding-game coin-flips, favorites choking
              under elimination, and chalky↔chaotic star-bias scaling). */}
          <div
            className="inline-flex border border-rift-line divide-x divide-rift-line"
            title="How often the better team actually wins. Chalky: favorites dominate. Balanced: gentle upsets. Chaotic: ratings matter less, game 5s and reverse sweeps become real. Off: classic model."
          >
            {(["off", "chalky", "balanced", "chaotic"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setVariancePreset(p)}
                className={`px-2.5 py-1.5 text-[9px] uppercase tracking-[0.25em] transition-all ${
                  variancePreset === p
                    ? "bg-rift-gold/10 text-rift-goldbright"
                    : "text-rift-mutedbright hover:text-rift-goldbright"
                }`}
              >
                {p === "off" ? "Variance" : p}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFearless(!fearless)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              fearless
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="Fearless draft within every series"
          >
            Fearless {fearless ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setTimerEnabled(!timerEnabled)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              timerEnabled
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="Pick/ban timer in matches you play yourself"
          >
            Draft Timer {timerEnabled ? "ON" : "OFF"}
          </button>
          <label className="flex flex-col gap-1">
            <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
              AI Difficulty
            </span>
            <select
              value={aiDifficulty}
              onChange={(e) => setAiDifficulty(e.target.value as AIDifficulty)}
              className={SELECT_CLS}
            >
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
              Follow / Control a Team (optional)
            </span>
            <TeamPicker
              byLeague={byLeague}
              value={controlledTeamId}
              onChange={setControlledTeamId}
            />
          </div>
        </div>

        {/* Starting meta — the season snapshots the active meta at
            creation and evolves it from there. Collapsed by default since
            most users keep the current meta. */}
        <button
          type="button"
          onClick={() => setMetaOpen((o) => !o)}
          className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 hover:text-rift-goldbright transition-colors"
        >
          <span aria-hidden>{metaOpen ? "▾" : "▸"}</span>
          Starting Meta
          <span className="text-[8px] tracking-[0.2em] text-rift-mutedbright/55 normal-case">
            {metaOpen ? "" : "(optional — uses your current meta)"}
          </span>
        </button>
        {metaOpen && (
          <div className="border border-rift-line/40 bg-rift-bg/30 p-3 mb-6">
            <MetaPanel variant="compact" />
          </div>
        )}

        {/* Teams */}
        <div className="flex items-center gap-3 mb-2">
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            Teams
          </div>
          <button
            type="button"
            onClick={rerollAll}
            className="px-2.5 py-1 border border-rift-line text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
          >
            Re-roll Everything
          </button>
          <button
            type="button"
            onClick={applyBundledNames}
            disabled={realNames === "loading" || teams.length === 0}
            className={`px-2.5 py-1 border text-[9px] uppercase tracking-[0.25em] transition-all disabled:opacity-50 ${
              realNames === "done"
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50"
            }`}
            title="Rename every team to the real pro teams of each region (built-in list, works offline)"
          >
            {realNames === "done" ? "Real Names ✓" : "Real Names"}
          </button>
          <button
            type="button"
            onClick={applyRealNames}
            disabled={realNames === "loading" || teams.length === 0}
            className="px-2.5 py-1 border border-rift-line text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 transition-all disabled:opacity-50 disabled:cursor-wait"
            title="Fetch the current real teams of each region live from the LoL Esports API"
          >
            {realNames === "loading" ? "Fetching…" : "Fetch Live"}
          </button>
          {realNames === "error" && (
            <span className="text-[9px] uppercase tracking-[0.2em] text-rift-red">
              Esports API unreachable — applied the built-in names
            </span>
          )}
        </div>
        <div className="space-y-2 mb-8">
          {LEAGUE_IDS.map((league) => {
            const open = openLeague === league;
            const ts = byLeague.get(league) ?? [];
            return (
              <div key={league} className="border border-rift-line/40 bg-rift-bg/30">
                <div className="flex items-center justify-between px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpenLeague(open ? null : league)}
                    className="flex-1 text-left font-display text-sm tracking-[0.2em] uppercase text-rift-goldbright"
                  >
                    {open ? "▾" : "▸"} {LEAGUE_NAMES[league]}
                  </button>
                  <button
                    type="button"
                    onClick={() => rerollLeague(league)}
                    className="px-2 py-1 text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 hover:text-rift-goldbright transition-colors"
                  >
                    Re-roll Names
                  </button>
                </div>
                {open && (
                  <div className="border-t border-rift-line/30 divide-y divide-rift-line/20">
                    {ts.map((t) => (
                      <div key={t.id}>
                      <div className="flex items-center gap-2 px-3 py-1.5">
                        <span
                          className="w-2.5 h-2.5 flex-shrink-0"
                          style={{ backgroundColor: t.color }}
                          aria-hidden
                        />
                        <TeamIcon
                          iconKey={t.iconKey}
                          logoUrl={t.logoUrl}
                          size={16}
                          color={t.color}
                        />
                        <input
                          value={t.name}
                          onChange={(e) =>
                            setTeams((prev) =>
                              prev.map((x) =>
                                x.id === t.id
                                  ? { ...x, name: e.target.value }
                                  : x,
                              ),
                            )
                          }
                          className="flex-1 min-w-0 bg-transparent text-[12px] text-rift-mutedbright outline-none border-b border-transparent focus:border-rift-gold/40"
                          aria-label="Team name"
                        />
                        <span
                          className="inline-flex items-center flex-shrink-0"
                          title="Team rating — click a star to set roster strength"
                        >
                          {[1, 2, 3, 4, 5].map((n) => {
                            const star = deriveStar(t.players);
                            return (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setTeamStar(t.id, n)}
                                aria-label={`Set ${t.name} rating to ${n} star${n === 1 ? "" : "s"}`}
                                className={`px-0.5 text-[11px] leading-none transition-colors ${
                                  n <= star
                                    ? "text-rift-gold hover:text-rift-goldbright"
                                    : "text-rift-line hover:text-rift-gold/60"
                                }`}
                              >
                                ★
                              </button>
                            );
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditTeamId((cur) => (cur === t.id ? null : t.id))
                          }
                          className={`px-1.5 text-[9px] uppercase tracking-[0.2em] transition-colors flex-shrink-0 ${
                            editTeamId === t.id
                              ? "text-rift-goldbright"
                              : "text-rift-mutedbright/50 hover:text-rift-goldbright"
                          }`}
                          title="Fine-tune individual player & coach ratings"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => rerollOne(t.id)}
                          className="px-1.5 text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright/50 hover:text-rift-goldbright transition-colors flex-shrink-0"
                          title="Re-roll this team's name, color, and icon"
                        >
                          Re-roll
                        </button>
                      </div>
                      {editTeamId === t.id && (
                        <TeamRatingEditor
                          team={t}
                          showAge={isReality}
                          onPlayerTier={setPlayerTier}
                          onPlayerAge={setPlayerAge}
                          onCoachRating={setCoachRating}
                        />
                      )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions — sticky so Start/Cancel stay reachable on this long
            form without scrolling to the very bottom. */}
        <div className="sticky bottom-0 z-10 grid grid-cols-2 gap-3 py-3 bg-rift-bg/90 backdrop-blur-sm border-t border-rift-line/40">
          <button
            type="button"
            onClick={onCancel}
            className="py-3 border border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5 text-[10px] md:text-xs uppercase tracking-[0.3em] transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={teams.length === 0}
            className="btn-gold py-3 font-display text-sm md:text-base tracking-[0.3em] uppercase disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Season
          </button>
        </div>
      </div>
    </div>
  );
}

// Per-team fine-tuning: set each player's skill tier and the coach's rating
// individually, so a team can be pulled off its preset star tier (a superteam
// in a weak region, a stacked bot lane, a star carry on a mediocre roster…).
const LANE_LABELS: Record<string, string> = {
  top: "TOP",
  jungle: "JNG",
  middle: "MID",
  bottom: "BOT",
  support: "SUP",
};
function TeamRatingEditor({
  team,
  showAge,
  onPlayerTier,
  onPlayerAge,
  onCoachRating,
}: {
  team: SeasonTeam;
  showAge: boolean;
  onPlayerTier: (teamId: string, lane: string, tier: PlayerTier) => void;
  onPlayerAge: (teamId: string, lane: string, age: number) => void;
  onCoachRating: (teamId: string, rating: number) => void;
}) {
  return (
    <div className="px-3 pb-2.5 pt-1 bg-rift-bg/40 border-t border-rift-line/20 flex flex-col gap-1">
      {team.players.map((p) => (
        <div key={p.lane} className="flex items-center gap-2 text-[11px]">
          <span className="w-8 text-[9px] tracking-[0.2em] text-rift-mutedbright/60 flex-shrink-0">
            {LANE_LABELS[p.lane] ?? p.lane}
          </span>
          <span className="flex-1 min-w-0 truncate text-rift-mutedbright">
            {p.name ?? p.lane}
          </span>
          {showAge && (
            <label className="flex items-center gap-1 flex-shrink-0 text-[9px] text-rift-mutedbright/60">
              Age
              <input
                type="number"
                min={16}
                max={40}
                value={p.age ?? ""}
                onChange={(e) => {
                  // Ignore an empty field so the user can clear it to retype
                  // (Number("") is 0, which would snap the age to the min).
                  if (e.target.value !== "")
                    onPlayerAge(team.id, p.lane, Number(e.target.value));
                }}
                className="w-11 px-1 py-0.5 border border-rift-line/50 bg-rift-bg/40 text-[10px] text-rift-mutedbright tabular-nums focus:border-rift-gold/50 focus:outline-none"
                aria-label={`${p.name ?? p.lane} age`}
              />
            </label>
          )}
          <select
            value={p.tier}
            onChange={(e) =>
              onPlayerTier(team.id, p.lane, e.target.value as PlayerTier)
            }
            className={`${SELECT_CLS} py-0.5 text-[10px]`}
            aria-label={`${p.name ?? p.lane} skill tier`}
          >
            {PLAYER_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </div>
      ))}
      {team.coach && (
        <div className="flex items-center gap-2 text-[11px] mt-0.5 pt-1 border-t border-rift-line/20">
          <span className="text-[8px] tracking-[0.12em] text-rift-gold/60 flex-shrink-0">
            COACH
          </span>
          <span className="flex-1 min-w-0 truncate text-rift-mutedbright">
            {team.coach.name}
          </span>
          <span
            className="inline-flex items-center flex-shrink-0"
            title="Coach rating — drives draft AI strength"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onCoachRating(team.id, n)}
                aria-label={`Set ${team.coach!.name} rating to ${n}`}
                className={`px-0.5 text-[11px] leading-none transition-colors ${
                  n <= Math.round(team.coach!.rating)
                    ? "text-rift-gold hover:text-rift-goldbright"
                    : "text-rift-line hover:text-rift-gold/60"
                }`}
              >
                ★
              </button>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

// Custom team dropdown for Follow/Control. A native <select> popup is
// positioned by the browser and flips upward when the control sits in
// the lower half of the viewport — this one always opens BELOW the
// trigger, and gets team icons/colors as a bonus.
function TeamPicker({
  byLeague,
  value,
  onChange,
}: {
  byLeague: Map<LeagueId, SeasonTeam[]>;
  value: string | null;
  onChange: (teamId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = value
    ? [...byLeague.values()].flat().find((t) => t.id === value) ?? null
    : null;

  const pick = (teamId: string | null) => {
    onChange(teamId);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs px-2 py-1.5 outline-none focus:border-rift-gold/60 hover:border-rift-gold/40 transition-colors text-left"
      >
        {selected ? (
          <>
            <TeamIcon
              iconKey={selected.iconKey}
              logoUrl={selected.logoUrl}
              size={13}
              color={selected.color}
            />
            <span className="flex-1 truncate">{selected.name}</span>
            <span className="text-[9px] uppercase tracking-[0.15em] text-rift-gold/60">
              {selected.leagueId}
            </span>
          </>
        ) : (
          <span className="flex-1">Spectate everything</span>
        )}
        <svg
          viewBox="0 0 16 16"
          className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-40 max-h-64 overflow-y-auto custom-scroll bg-rift-panel border border-rift-gold/40 shadow-[0_8px_30px_rgba(0,0,0,0.7)]"
        >
          <button
            type="button"
            role="option"
            aria-selected={value == null}
            onClick={() => pick(null)}
            className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${
              value == null
                ? "text-rift-goldbright bg-rift-gold/10"
                : "text-rift-mutedbright hover:bg-rift-gold/5 hover:text-rift-goldbright"
            }`}
          >
            Spectate everything
          </button>
          {LEAGUE_IDS.map((l) => (
            <div key={l}>
              <div className="px-2 pt-1.5 pb-0.5 text-[8px] uppercase tracking-[0.3em] text-rift-gold/70 border-t border-rift-line/30">
                {l}
              </div>
              {(byLeague.get(l) ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={value === t.id}
                  onClick={() => pick(t.id)}
                  className={`w-full flex items-center gap-1.5 text-left px-2 py-1 text-xs transition-colors ${
                    value === t.id
                      ? "text-rift-goldbright bg-rift-gold/10"
                      : "text-rift-mutedbright hover:bg-rift-gold/5 hover:text-rift-goldbright"
                  }`}
                >
                  <TeamIcon
                    iconKey={t.iconKey}
                    logoUrl={t.logoUrl}
                    size={13}
                    color={t.color}
                  />
                  <span className="truncate">{t.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
