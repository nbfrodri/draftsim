"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  decodeMetaOverride,
  encodeMetaOverride,
  getMetaTier,
  getMetaTiers,
  TIER_ORDER,
  type MetaOverride,
  type MetaTier,
} from "@/lib/championMeta";
import type { Champion, Lane } from "@/lib/types";
import LaneIcon from "./LaneIcon";

interface Props {
  open: boolean;
  champions: Champion[];
  // Initial state from current active meta — editor seeds from this so the
  // user starts with whatever meta is currently active (default, randomized,
  // or previously-saved custom).
  initialOverride: MetaOverride | null;
  onSave: (override: MetaOverride) => void;
  onClose: () => void;
}

const ROLES: readonly { lane: Lane; label: string }[] = [
  { lane: "top", label: "Top" },
  { lane: "jungle", label: "Jungle" },
  { lane: "middle", label: "Mid" },
  { lane: "bottom", label: "Bot" },
  { lane: "support", label: "Support" },
];

interface TierStyle {
  ring: string;
  text: string;
  bg: string;
  accent: string;
  drop: string;
}

const TIER_STYLES: Record<MetaTier, TierStyle> = {
  "S+": {
    ring: "ring-1 ring-rift-gold/80",
    text: "text-rift-goldbright",
    bg: "bg-gradient-to-r from-rift-gold/12 via-rift-gold/8 to-transparent",
    accent: "bg-gradient-to-b from-rift-goldbright via-rift-gold to-rift-golddark",
    drop: "ring-2 ring-rift-gold bg-rift-gold/15",
  },
  S: {
    ring: "ring-1 ring-rift-gold/50",
    text: "text-rift-goldbright",
    bg: "bg-rift-gold/[0.06]",
    accent: "bg-rift-gold",
    drop: "ring-2 ring-rift-gold bg-rift-gold/10",
  },
  A: {
    ring: "ring-1 ring-rift-blue/50",
    text: "text-rift-bluebright",
    bg: "bg-rift-bluedeep/12",
    accent: "bg-rift-blue",
    drop: "ring-2 ring-rift-blue bg-rift-blue/15",
  },
  B: {
    ring: "ring-1 ring-rift-line",
    text: "text-rift-mutedbright",
    bg: "bg-rift-line/20",
    accent: "bg-rift-mutedbright/60",
    drop: "ring-2 ring-rift-mutedbright bg-rift-line/30",
  },
  C: {
    ring: "ring-1 ring-rift-line/60",
    text: "text-rift-muted",
    bg: "bg-rift-bg/40",
    accent: "bg-rift-muted/60",
    drop: "ring-2 ring-rift-muted bg-rift-bg/60",
  },
  D: {
    ring: "ring-1 ring-rift-red/30",
    text: "text-rift-muted",
    bg: "bg-rift-reddeep/10",
    accent: "bg-rift-red/60",
    drop: "ring-2 ring-rift-red bg-rift-red/15",
  },
};

const ROLE_ACCENT: Record<Lane, string> = {
  top: "bg-rift-gold",
  jungle: "bg-rift-fighter",
  middle: "bg-rift-mage",
  bottom: "bg-rift-marksman",
  support: "bg-rift-support",
};

// Build a fresh editor state seeded from the provided override, falling back
// to the active meta lookups for any missing entries. Only champion+lane
// combos that are valid (per Meraki lanes) get an entry.
// Lanes a champion is editable in. The CommunityDragon/Meraki position
// feed updates a few weeks AFTER a Riot release — so brand-new champions
// (e.g. Zaahen, post-25.23) ship with empty `c.lanes` and disappear from
// the editor. To work around that, we union Meraki's lanes with whatever
// lanes our own CHAMPION_META has tiers for. As soon as Meraki catches
// up the union becomes a no-op.
const ALL_LANES: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

function playableLanesFor(c: Champion): Lane[] {
  const set = new Set<Lane>(c.lanes);
  const metaTiers = getMetaTiers(c.alias);
  for (const lane of ALL_LANES) {
    if (metaTiers[lane] != null) set.add(lane);
  }
  return ALL_LANES.filter((l) => set.has(l));
}

function buildInitialEditing(
  champions: Champion[],
  initialOverride: MetaOverride | null,
  fallbackTier: (alias: string, lane: Lane) => MetaTier | null,
): MetaOverride {
  const result: MetaOverride = {};
  for (const c of champions) {
    result[c.alias] = {};
    // Iterate the union of Meraki lanes + our own meta-data lanes so newly
    // released champions still seed correctly.
    for (const lane of playableLanesFor(c)) {
      // Prefer the supplied initial override, then fall back to default tier.
      const overrideTier = initialOverride?.[c.alias]?.[lane];
      if (overrideTier) {
        result[c.alias][lane] = overrideTier;
      } else if (initialOverride && initialOverride[c.alias] !== undefined) {
        // Override is authoritative for this champion — if not listed, skip.
        continue;
      } else {
        const baseline = fallbackTier(c.alias, lane);
        if (baseline) result[c.alias][lane] = baseline;
      }
    }
  }
  return result;
}

export default function MetaEditor({
  open,
  champions,
  initialOverride,
  onSave,
  onClose,
}: Props) {
  const [activeRole, setActiveRole] = useState<Lane>("top");
  const [editing, setEditing] = useState<MetaOverride>({});
  const [draggedAlias, setDraggedAlias] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<MetaTier | null>(null);
  const [mounted, setMounted] = useState(false);

  // "Add champion" picker state. The panel toggles open with a search box
  // listing champions not already in the active role's tier list.
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");

  // Import / Export state. The import panel toggles open with a textarea
  // for pasting JSON. Status feedback (copied / imported / error) lives in
  // a single transient string that auto-clears on the next user action.
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  // Auto-clear feedback after 3 seconds so success toasts don't linger.
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  // Pre-built alias set for the import validator — lets us silently drop
  // entries from older exports whose champions were renamed/removed.
  const validAliases = useMemo(
    () => new Set(champions.map((c) => c.alias)),
    [champions],
  );

  const handleExport = async () => {
    let code: string;
    try {
      code = await encodeMetaOverride(editing);
    } catch (e) {
      setFeedback({
        kind: "err",
        text: `Encode failed: ${e instanceof Error ? e.message : "unknown"}`,
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setFeedback({ kind: "ok", text: "Meta code copied to clipboard" });
    } catch {
      // Clipboard access denied (user blocked / no HTTPS / etc.). Fall back
      // to opening the import panel pre-filled so the user can copy manually.
      setImportOpen(true);
      setImportText(code);
      setFeedback({
        kind: "err",
        text: "Clipboard blocked — copy from the box below",
      });
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      setFeedback({ kind: "err", text: "Paste a meta code first" });
      return;
    }
    const result = await decodeMetaOverride(importText, validAliases);
    if (result.error || !result.override) {
      setFeedback({ kind: "err", text: result.error ?? "Decode failed" });
      return;
    }
    setEditing(result.override);
    setImportOpen(false);
    setImportText("");
    const skipped = result.skippedEntries
      ? ` (${result.skippedEntries} skipped)`
      : "";
    setFeedback({
      kind: "ok",
      text: `Imported ${result.championCount} champions${skipped}`,
    });
  };

  useEffect(() => setMounted(true), []);

  // Re-seed the editor whenever it opens with a fresh snapshot of the active
  // meta. getMetaTier reads the override+baseline so random/custom states flow.
  useEffect(() => {
    if (!open) return;
    const seed = buildInitialEditing(champions, initialOverride, getMetaTier);
    setEditing(seed);
  }, [open, champions, initialOverride]);

  // Clear the add-picker search when switching roles so each role tab opens
  // with a fresh list (the panel itself stays open if the user left it open).
  useEffect(() => {
    setAddSearch("");
  }, [activeRole]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Champions to show in the active role, grouped by their current edited
  // tier in that role. The displayed list IS the role's tier list being
  // built: any champion with a tier in `editing[alias][activeRole]` shows,
  // regardless of whether Meraki tags them for the role. That's what lets a
  // user flex an off-role pick (e.g. a support champion) into the jungle
  // tier list and see it here. Champions without a tier in this role are
  // excluded (they live in the "Add champion" picker instead).
  const grouped = useMemo(() => {
    const buckets: Record<MetaTier, Champion[]> = {
      "S+": [],
      S: [],
      A: [],
      B: [],
      C: [],
      D: [],
    };
    for (const c of champions) {
      const tier = editing[c.alias]?.[activeRole];
      if (!tier) continue;
      buckets[tier].push(c);
    }
    for (const t of TIER_ORDER) {
      buckets[t].sort((a, b) => a.name.localeCompare(b.name));
    }
    return buckets;
  }, [champions, activeRole, editing]);

  // Champions NOT yet in the active role's tier list — the pool the "Add
  // champion" picker draws from. Includes every champion (any role) so the
  // user can pull, say, a support into the jungle list. Filtered by the add
  // search box and capped so an empty search doesn't render the whole roster.
  const ADD_RESULT_CAP = 60;
  const availableToAdd = useMemo(() => {
    const term = addSearch.trim().toLowerCase();
    return champions
      .filter((c) => editing[c.alias]?.[activeRole] == null)
      .filter(
        (c) =>
          !term ||
          c.name.toLowerCase().includes(term) ||
          c.alias.toLowerCase().includes(term),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [champions, editing, activeRole, addSearch]);

  // Set (or change) a champion's tier in the active role. Doubles as the
  // "add to this role" action — assigning a tier to a champion that had none
  // is exactly how it joins the role's tier list.
  const moveTier = (alias: string, newTier: MetaTier) => {
    setEditing((prev) => {
      const next: MetaOverride = { ...prev };
      const champTiers = { ...(next[alias] ?? {}) };
      champTiers[activeRole] = newTier;
      next[alias] = champTiers;
      return next;
    });
  };

  // Add a champion to the active role at the given tier, from the picker.
  const addToRole = (champ: Champion, tier: MetaTier) => {
    moveTier(champ.alias, tier);
    setFeedback({
      kind: "ok",
      text: `Added ${champ.name} to ${activeRole} (${tier})`,
    });
  };

  // Remove a champion from the active role's tier list entirely. Deleting
  // the lane key drops it from this role only — its tiers in other roles are
  // untouched. Because the saved override is authoritative per champion, an
  // absent lane reads back as "not played here" (getMetaTier → null).
  const removeFromRole = (champ: Champion) => {
    setEditing((prev) => {
      const next: MetaOverride = { ...prev };
      const champTiers = { ...(next[champ.alias] ?? {}) };
      delete champTiers[activeRole];
      next[champ.alias] = champTiers;
      return next;
    });
    setFeedback({ kind: "ok", text: `Removed ${champ.name} from ${activeRole}` });
  };

  const handleSave = () => {
    onSave(editing);
    onClose();
  };

  const handleDragStart = (alias: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", alias);
    e.dataTransfer.effectAllowed = "move";
    setDraggedAlias(alias);
  };

  const handleDragEnd = () => {
    setDraggedAlias(null);
    setDropTarget(null);
  };

  const handleDragOver = (tier: MetaTier) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== tier) setDropTarget(tier);
  };

  const handleDragLeave = (tier: MetaTier) => () => {
    if (dropTarget === tier) setDropTarget(null);
  };

  const handleDrop = (tier: MetaTier) => (e: React.DragEvent) => {
    e.preventDefault();
    const alias = e.dataTransfer.getData("text/plain");
    if (!alias) return;
    moveTier(alias, tier);
    setDraggedAlias(null);
    setDropTarget(null);
  };

  if (!open || !mounted) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-start md:items-center justify-center px-3 py-4 md:px-6 md:py-8 bg-black/75 backdrop-blur-sm overflow-y-auto animate-[fadeSlide_220ms_ease-out]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="meta-editor-title"
        className="relative w-full max-w-4xl bg-rift-panel/95 border border-rift-gold/50 shadow-[0_0_60px_rgba(0,0,0,0.85)] my-auto"
      >
        <span className="absolute -top-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" />

        {/* Header */}
        <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 md:pb-4 border-b border-rift-gold/20">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.45em] text-rift-gold/70">
                Custom Meta Editor
              </div>
              <h2
                id="meta-editor-title"
                className="font-display text-2xl md:text-3xl tracking-[0.18em] text-rift-goldbright mt-0.5"
              >
                <span className="bg-gold-sheen bg-clip-text text-transparent">
                  EDIT
                </span>
                <span className="text-rift-gold/90 ml-2">META</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close editor"
              className="w-9 h-9 flex items-center justify-center text-rift-mutedbright hover:text-rift-goldbright hover:bg-rift-gold/10 transition-colors border border-rift-line hover:border-rift-gold/60"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="ornament">
            <span className="text-[9px] md:text-[10px] tracking-[0.4em] text-rift-gold/50 uppercase">
              Drag to retier · Add or remove champions · Save when done
            </span>
          </div>

          {/* Export / Import controls. Keep it compact — small icon-buttons
              that surface the JSON-copy and JSON-paste flows without
              cluttering the header. The import textarea is collapsed by
              default. */}
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 text-[10px] md:text-[11px] uppercase tracking-[0.25em] transition-all"
              title="Copy current meta as JSON to clipboard"
            >
              <svg
                viewBox="0 0 16 16"
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden
              >
                <rect x="5" y="3" width="9" height="11" rx="1" />
                <path d="M11 3V2H3v11h2" strokeLinejoin="round" />
              </svg>
              Export
            </button>
            <button
              type="button"
              onClick={() => {
                setImportOpen((v) => !v);
                if (!importOpen) setImportText("");
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 border text-[10px] md:text-[11px] uppercase tracking-[0.25em] transition-all ${
                importOpen
                  ? "border-rift-gold/60 text-rift-goldbright bg-rift-gold/10"
                  : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5"
              }`}
              title="Paste JSON to import a meta tier list"
            >
              <svg
                viewBox="0 0 16 16"
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden
              >
                <path d="M8 2v9M5 8l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 14h10" strokeLinecap="round" />
              </svg>
              Import
            </button>
            {/* Transient status pill — shows "Copied!" / "Imported X champs" / errors */}
            {feedback && (
              <span
                className={`text-[10px] uppercase tracking-[0.25em] ${
                  feedback.kind === "ok"
                    ? "text-rift-goldbright"
                    : "text-rift-redbright"
                }`}
                role="status"
              >
                {feedback.text}
              </span>
            )}
          </div>

          {/* Inline import panel — textarea + apply button. Hidden when not
              actively importing. Pre-filled with the current export when
              the clipboard write fails so users can copy manually. */}
          {importOpen && (
            <div className="mt-3 border border-rift-gold/30 bg-rift-bg/60 p-2.5">
              <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70 mb-1.5">
                Paste meta code
              </div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="META1:..."
                spellCheck={false}
                className="w-full h-20 md:h-24 bg-rift-bg/80 border border-rift-line text-[11px] font-mono text-rift-mutedbright p-2 focus:outline-none focus:border-rift-gold/60 resize-none break-all"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setImportOpen(false);
                    setImportText("");
                    setFeedback(null);
                  }}
                  className="px-3 py-1 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/40 text-[10px] uppercase tracking-[0.25em] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  className="px-3 py-1 border border-rift-gold/50 bg-rift-gold/10 text-rift-goldbright hover:bg-rift-gold/20 text-[10px] uppercase tracking-[0.25em] transition-all"
                >
                  Apply Import
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Role tabs */}
        <div className="px-4 md:px-6 pt-4">
          <div className="grid grid-cols-5 gap-1 md:gap-2">
            {ROLES.map(({ lane, label }) => {
              const active = activeRole === lane;
              return (
                <button
                  key={lane}
                  type="button"
                  onClick={() => setActiveRole(lane)}
                  className={`relative flex items-center justify-center gap-1.5 md:gap-2 py-2.5 md:py-3 border-b-2 transition-all ${
                    active
                      ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                      : "border-transparent text-rift-mutedbright hover:text-rift-goldbright hover:bg-rift-gold/[0.04]"
                  }`}
                >
                  <LaneIcon lane={lane} size="sm" className={active ? "" : "opacity-70"} />
                  <span className="text-[10px] md:text-xs uppercase tracking-[0.25em] font-display">
                    {label}
                  </span>
                  {active && (
                    <span
                      className={`absolute left-0 right-0 -bottom-[2px] h-[2px] ${ROLE_ACCENT[lane]}`}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Add champion to this role. Lets the user pull ANY champion into the
            active role's tier list — including off-role picks (e.g. a support
            into the jungle list). Collapsed by default; opens a searchable
            list where clicking a tier chip places the champion. */}
        <div className="px-4 md:px-6 pt-3">
          <button
            type="button"
            onClick={() => {
              setAddOpen((v) => !v);
              if (!addOpen) setAddSearch("");
            }}
            aria-expanded={addOpen}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 border text-[10px] md:text-[11px] uppercase tracking-[0.25em] transition-all ${
              addOpen
                ? "border-rift-gold/60 text-rift-goldbright bg-rift-gold/10"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5"
            }`}
            title="Add a champion to this role's tier list"
          >
            <svg
              viewBox="0 0 16 16"
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden
            >
              <path d="M8 3v10M3 8h10" strokeLinecap="round" />
            </svg>
            Add champion to{" "}
            {ROLES.find((r) => r.lane === activeRole)?.label ?? activeRole}
          </button>

          {addOpen && (
            <div className="mt-2 border border-rift-gold/30 bg-rift-bg/60 p-2.5">
              <input
                type="text"
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search champions…"
                spellCheck={false}
                autoFocus
                className="w-full bg-rift-bg/80 border border-rift-line text-[12px] text-rift-mutedbright px-2.5 py-1.5 focus:outline-none focus:border-rift-gold/60 placeholder:text-rift-muted/60"
              />
              <div className="mt-2 max-h-48 overflow-y-auto custom-scroll divide-y divide-rift-line/30">
                {availableToAdd.length === 0 ? (
                  <div className="text-[10px] uppercase tracking-[0.3em] text-rift-muted/70 py-3 text-center italic">
                    {addSearch.trim()
                      ? "No matching champions"
                      : "Every champion is already in this list"}
                  </div>
                ) : (
                  availableToAdd.slice(0, ADD_RESULT_CAP).map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 py-1.5 px-1"
                    >
                      <img
                        src={c.iconUrl}
                        alt={c.name}
                        className="w-7 h-7 flex-shrink-0"
                        loading="lazy"
                        draggable={false}
                      />
                      <span className="text-[11px] text-rift-mutedbright font-display tracking-wider truncate flex-1 min-w-0">
                        {c.name}
                      </span>
                      <div className="flex gap-1 flex-shrink-0">
                        {TIER_ORDER.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => addToRole(c, t)}
                            className={`w-7 h-6 flex items-center justify-center border border-rift-line/60 ${TIER_STYLES[t].text} hover:border-rift-gold/60 hover:bg-rift-gold/10 text-[10px] font-display tracking-wide transition-all`}
                            title={`Add ${c.name} to ${activeRole} at ${t}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {availableToAdd.length > ADD_RESULT_CAP && (
                <div className="text-[9px] uppercase tracking-[0.3em] text-rift-muted/70 pt-2 text-center">
                  {availableToAdd.length - ADD_RESULT_CAP} more — refine your
                  search
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tier rows */}
        <div className="px-4 md:px-6 pt-4 pb-3 max-h-[58vh] overflow-y-auto custom-scroll space-y-2">
          {TIER_ORDER.map((tier) => {
            const champs = grouped[tier];
            const styles = TIER_STYLES[tier];
            const isDropTarget = dropTarget === tier;
            return (
              <div
                key={tier}
                onDragOver={handleDragOver(tier)}
                onDragLeave={handleDragLeave(tier)}
                onDrop={handleDrop(tier)}
                className={`relative flex items-stretch gap-0 border border-rift-line/50 ${styles.bg} ${
                  isDropTarget ? styles.drop : ""
                } transition-all`}
              >
                <span
                  className={`w-1 self-stretch ${styles.accent} flex-shrink-0`}
                  aria-hidden
                />
                <div
                  className={`flex flex-col items-center justify-center w-12 md:w-16 flex-shrink-0 bg-rift-bg/70 border-r border-rift-line/40 py-2`}
                >
                  <span
                    className={`font-display text-2xl md:text-3xl tracking-wider leading-none ${styles.text}`}
                  >
                    {tier}
                  </span>
                  <span className="text-[8px] md:text-[9px] uppercase tracking-[0.2em] text-rift-muted mt-1 tabular-nums">
                    {champs.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 md:gap-2 py-2 px-2 md:px-3 flex-1 min-w-0 min-h-[3rem]">
                  {champs.length === 0 ? (
                    <span className="text-[10px] uppercase tracking-[0.3em] text-rift-muted/70 self-center italic">
                      Drop champions here
                    </span>
                  ) : (
                    champs.map((c) => (
                      <DraggableChampion
                        key={c.id}
                        champ={c}
                        ring={styles.ring}
                        isDragging={draggedAlias === c.alias}
                        onDragStart={handleDragStart(c.alias)}
                        onDragEnd={handleDragEnd}
                        onRemove={() => removeFromRole(c)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Save / Cancel */}
        <div className="border-t border-rift-gold/20 px-4 md:px-6 py-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 font-display text-[11px] md:text-xs tracking-[0.3em] uppercase transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-gold py-2.5 font-display text-[11px] md:text-xs tracking-[0.3em] uppercase"
          >
            Save Custom Meta
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

function DraggableChampion({
  champ,
  ring,
  isDragging,
  onDragStart,
  onDragEnd,
  onRemove,
}: {
  champ: Champion;
  ring: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group relative flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 bg-rift-bg/80 border border-rift-line/60 ${ring} cursor-grab active:cursor-grabbing transition-all hover:bg-rift-bg hover:scale-[1.04] ${
        isDragging ? "opacity-40 scale-95" : ""
      }`}
      title={`Drag ${champ.name} to change tier`}
    >
      <img
        src={champ.iconUrl}
        alt={champ.name}
        className="w-7 h-7 md:w-8 md:h-8 flex-shrink-0 pointer-events-none"
        loading="lazy"
        draggable={false}
      />
      <span className="text-[10px] md:text-[11px] text-rift-mutedbright group-hover:text-rift-goldbright font-display tracking-wider truncate max-w-[6.5rem] md:max-w-[8rem] transition-colors pointer-events-none">
        {champ.name}
      </span>
      {/* Remove from this role's tier list. Stop mousedown from bubbling so
          clicking the × doesn't start a drag on the parent. */}
      <button
        type="button"
        draggable={false}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${champ.name} from this tier list`}
        title={`Remove ${champ.name} from this role`}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 items-center justify-center bg-rift-reddeep border border-rift-red/70 text-rift-redbright hover:bg-rift-red hover:text-white hidden group-hover:flex transition-colors"
      >
        <svg
          viewBox="0 0 16 16"
          className="w-2.5 h-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
