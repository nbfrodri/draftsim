"use client";

import { useState } from "react";
import { useDraftStore } from "@/store/draftStore";
import TierListView from "./TierListView";
import MetaEditor from "./MetaEditor";
import SynergyView from "./SynergyView";

// Reusable meta-tier controls panel. Used by:
//   • CreateSimulationForm — single-series setup
//   • TournamentSetup — tournament setup
//
// Self-contained: reads meta state from the draft store, manages its own
// open/close state for the three modals (tier list, synergy, custom
// editor), and renders the 5 actions plus the master switch toggle.
//
// Design choice: pure components have no required props. Variant lets
// callers pick a visual size:
//   • `full`     — original layout used in single-series setup
//   • `compact`  — no section header, denser padding (tournament setup)
//   • `view-only` — only the two View buttons, no toggle / randomize /
//                   edit / reset. Used in post-tournament recap where
//                   editing the meta would be meaningless after the fact.
interface Props {
  variant?: "full" | "compact" | "view-only";
}

export default function MetaPanel({ variant = "full" }: Props) {
  const champions = useDraftStore((s) => s.champions);
  const metaOverride = useDraftStore((s) => s.metaOverride);
  const metaVersion = useDraftStore((s) => s.metaVersion);
  const metaSource = useDraftStore((s) => s.metaSource);
  const metaEnabled = useDraftStore((s) => s.metaEnabled);
  const setMetaEnabled = useDraftStore((s) => s.setMetaEnabled);
  const randomizeMetaTiers = useDraftStore((s) => s.randomizeMetaTiers);
  const resetMetaTiers = useDraftStore((s) => s.resetMetaTiers);
  const applyCustomMeta = useDraftStore((s) => s.applyCustomMeta);

  const [tierListOpen, setTierListOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [synergyOpen, setSynergyOpen] = useState(false);

  const isCustomized = metaOverride != null;
  const compact = variant === "compact";
  const viewOnly = variant === "view-only";

  return (
    <div className={compact || viewOnly ? "" : "mt-3"}>
      {!compact && !viewOnly && (
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
          Meta Tier System
        </div>
      )}
      {/* View buttons — Tier List + Synergies. Two-column grid. */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTierListOpen(true)}
          className="py-2.5 border border-rift-gold/60 bg-rift-gold/5 text-rift-goldbright hover:bg-rift-gold/15 hover:border-rift-gold font-display text-[11px] md:text-sm tracking-[0.3em] uppercase transition-all flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 md:w-4 md:h-4" aria-hidden>
            <path d="M3 4h14v2H3zM3 9h10v2H3zM3 14h6v2H3z" />
            <path d="M15 11h2v2h-2zM12 14h5v2h-5z" opacity="0.6" />
          </svg>
          <span className="hidden md:inline">View Tier List</span>
          <span className="md:hidden">Tier List</span>
        </button>
        <button
          type="button"
          onClick={() => setSynergyOpen(true)}
          className="py-2.5 border border-rift-gold/60 bg-rift-gold/5 text-rift-goldbright hover:bg-rift-gold/15 hover:border-rift-gold font-display text-[11px] md:text-sm tracking-[0.3em] uppercase transition-all flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 md:w-4 md:h-4" aria-hidden>
            <circle cx="6" cy="10" r="3" />
            <circle cx="14" cy="10" r="3" />
            <path d="M9 10h2" strokeLinecap="round" />
          </svg>
          <span className="hidden md:inline">View Synergies</span>
          <span className="md:hidden">Synergies</span>
        </button>
      </div>

      {/* The toggle / randomize / edit / reset / source indicator block
          is hidden in view-only mode (post-tournament recap). The meta
          shouldn't be mutated after the fact — the AI used a snapshot,
          and surfacing controls would imply otherwise. */}
      {!viewOnly && (
        <>
      {/* Meta master switch */}
      <button
        type="button"
        onClick={() => setMetaEnabled(!metaEnabled)}
        className={`mt-2 w-full flex items-center justify-between px-3 py-2 border transition-all text-left ${
          metaEnabled
            ? "border-rift-gold/60 bg-rift-gold/5"
            : "border-rift-line hover:border-rift-gold/40 hover:bg-rift-gold/[0.03]"
        }`}
        aria-pressed={metaEnabled}
      >
        <div>
          <div className="font-display text-[11px] md:text-xs uppercase tracking-[0.3em] text-rift-goldbright">
            Meta tiers
          </div>
          <div className="text-[9px] md:text-[10px] text-rift-muted mt-0.5">
            {metaEnabled
              ? "ON — AI prefers S+ picks; sim weights tier strength"
              : "OFF — flat meta, every champion treated as neutral"}
          </div>
        </div>
        <div
          className={`relative w-10 h-5 rounded-full border transition-colors shrink-0 ml-3 ${
            metaEnabled
              ? "bg-gradient-to-r from-rift-golddark to-rift-gold border-rift-gold"
              : "bg-rift-bg border-rift-line"
          }`}
        >
          <div
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
              metaEnabled
                ? "left-[22px] bg-rift-goldbright shadow-[0_0_8px_rgba(240,230,210,0.7)]"
                : "left-0.5 bg-rift-muted"
            }`}
          />
        </div>
      </button>

      {/* Randomize / Edit / Reset triple. Disabled when meta is OFF. */}
      <div
        className={`grid grid-cols-3 gap-2 mt-2 transition-opacity ${
          metaEnabled ? "" : "opacity-40 pointer-events-none"
        }`}
      >
        <button
          type="button"
          onClick={randomizeMetaTiers}
          className="py-2 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 font-display text-[10px] md:text-xs tracking-[0.25em] uppercase transition-all flex items-center justify-center gap-1.5"
          title={isCustomized && metaSource === "randomized" ? "Re-randomize" : "Randomize meta"}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3.5 h-3.5" aria-hidden>
            <path d="M2 4h7l-2-2M14 12H7l2 2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 12c0-3 3-4 5-4s5 1 5 4" strokeLinecap="round" />
          </svg>
          <span className="hidden md:inline">Randomize</span>
          <span className="md:hidden">Random</span>
        </button>
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="py-2 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 font-display text-[10px] md:text-xs tracking-[0.25em] uppercase transition-all flex items-center justify-center gap-1.5"
          title="Edit meta with drag and drop"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3.5 h-3.5" aria-hidden>
            <path d="M2 12l8-8 2 2-8 8H2v-2zM10 4l2 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hidden md:inline">Custom Edit</span>
          <span className="md:hidden">Edit</span>
        </button>
        <button
          type="button"
          onClick={resetMetaTiers}
          disabled={!isCustomized}
          className={`py-2 border font-display text-[10px] md:text-xs tracking-[0.25em] uppercase transition-all flex items-center justify-center gap-1.5 ${
            isCustomized
              ? "border-rift-line text-rift-mutedbright hover:text-rift-redbright hover:border-rift-red/50 hover:bg-rift-red/5"
              : "border-rift-line/40 text-rift-muted/40 cursor-not-allowed"
          }`}
        >
          Reset
        </button>
      </div>

      {/* Active source indicator */}
      <div className="mt-2 text-center text-[9px] md:text-[10px] uppercase tracking-[0.35em]">
        <span className="text-rift-muted">Active meta · </span>
        <span
          className={
            metaSource === "custom"
              ? "text-rift-bluebright"
              : metaSource === "randomized"
              ? "text-rift-goldbright"
              : "text-rift-mutedbright"
          }
        >
          {metaSource === "default"
            ? "Default"
            : metaSource === "randomized"
            ? "Randomized"
            : "Custom"}
        </span>
      </div>
        </>
      )}

      {/* Modals */}
      <TierListView
        open={tierListOpen}
        champions={champions}
        overrideVersion={metaVersion}
        onClose={() => setTierListOpen(false)}
      />
      <MetaEditor
        open={editorOpen}
        champions={champions}
        initialOverride={metaOverride}
        onSave={(override) => applyCustomMeta(override)}
        onClose={() => setEditorOpen(false)}
      />
      <SynergyView
        open={synergyOpen}
        champions={champions}
        onClose={() => setSynergyOpen(false)}
      />
    </div>
  );
}
