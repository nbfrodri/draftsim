"use client";

import { useEffect,useMemo,useState } from "react";

import {
COUNTER_SEVERITY_MAX,
COUNTER_SEVERITY_MIN,
SYNERGY_BONUS_MAX,
SYNERGY_BONUS_MIN,
decodePairings,
encodePairings,
getActiveCounterOverride,
getActiveSynergies,
type CounterPair,
type Synergy,
} from "@/lib/championMeta";
import { isDesktop,openFileNative,saveFileNative } from "@/lib/desktopStorage";
import { HARD_COUNTERS } from "@/lib/draftAI/data";
import type { Champion } from "@/lib/types";
import { useDraftStore } from "@/store/draftStore";
import Modal from "./Modal";

// Main-menu section: the user's library of synergy + counterpick sets.
// Each preset bundles a Synergy[] and a CounterPair[] that can be built
// in the editor modal (add/edit/remove individual pairs), duplicated,
// exported/imported as a PAIR1: code, and applied as the ACTIVE pairings
// used by the draft AI and the simulator.

interface Props {
  onBack: () => void;
}

export default function PairingsLibrary({ onBack }: Props) {
  const champions = useDraftStore((s) => s.champions);
  const pairingsPresets = useDraftStore((s) => s.pairingsPresets);
  const createPairingsPreset = useDraftStore((s) => s.createPairingsPreset);
  const updatePairingsPreset = useDraftStore((s) => s.updatePairingsPreset);
  const deletePairingsPreset = useDraftStore((s) => s.deletePairingsPreset);
  const duplicatePairingsPreset = useDraftStore(
    (s) => s.duplicatePairingsPreset,
  );
  const applyPairingsPreset = useDraftStore((s) => s.applyPairingsPreset);

  // null = closed, "new" = creating, otherwise preset id being edited.
  const [editorTarget, setEditorTarget] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [exportText, setExportText] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  useEffect(() => {
    if (!appliedId) return;
    const t = setTimeout(() => setAppliedId(null), 2500);
    return () => clearTimeout(t);
  }, [appliedId]);

  const validAliases = useMemo(
    () => new Set(champions.map((c) => c.alias)),
    [champions],
  );

  const editingPreset =
    editorTarget && editorTarget !== "new"
      ? pairingsPresets.find((p) => p.id === editorTarget) ?? null
      : null;
  const confirmEntry = confirmDelete
    ? pairingsPresets.find((p) => p.id === confirmDelete)
    : null;

  const handleApply = (id: string) => {
    applyPairingsPreset(id);
    setAppliedId(id);
    setFeedback({
      kind: "ok",
      text: "Pairings applied — the AI and simulator now use this set",
    });
  };

  const handleExport = async (presetId: string) => {
    const preset = pairingsPresets.find((p) => p.id === presetId);
    if (!preset) return;
    let code: string;
    try {
      code = await encodePairings(preset.synergies, preset.counters, preset.name);
    } catch (e) {
      setFeedback({
        kind: "err",
        text: `Encode failed: ${e instanceof Error ? e.message : "unknown"}`,
      });
      return;
    }
    if (isDesktop()) {
      const safeName = preset.name.replace(/[/\\:*?"<>|]/g, "_") || "pairings";
      const result = await saveFileNative({
        defaultPath: `${safeName}.pairings.json`,
        filters: [{ name: "DraftSim Pairings", extensions: ["json"] }],
        content: code,
      });
      if (result.ok) {
        setFeedback({ kind: "ok", text: "Pairings saved to file" });
      } else if (result.error && result.error !== "cancelled") {
        setFeedback({ kind: "err", text: `Save failed: ${result.error}` });
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setFeedback({ kind: "ok", text: "Pairings code copied to clipboard" });
    } catch {
      setExportText(code);
    }
  };

  const handleImport = async () => {
    const decodeAndCreate = async (raw: string) => {
      const result = await decodePairings(raw, validAliases);
      if (result.error || (!result.synergies && !result.counters)) {
        setFeedback({ kind: "err", text: result.error ?? "Decode failed" });
        return false;
      }
      const name =
        result.name ?? `Imported Pairings ${pairingsPresets.length + 1}`;
      createPairingsPreset(
        name,
        result.synergies ?? [],
        (result.counters ?? []) as CounterPair[],
      );
      const skipped = result.skippedEntries
        ? ` (${result.skippedEntries} skipped)`
        : "";
      setFeedback({
        kind: "ok",
        text: `Imported ${result.synergies?.length ?? 0} synergies · ${result.counters?.length ?? 0} counters as "${name}"${skipped}`,
      });
      return true;
    };
    if (isDesktop()) {
      const fileResult = await openFileNative({
        filters: [{ name: "DraftSim Pairings", extensions: ["json"] }],
      });
      if (!fileResult.ok || fileResult.content == null) {
        if (fileResult.error && fileResult.error !== "cancelled") {
          setFeedback({ kind: "err", text: fileResult.error });
        }
        return;
      }
      await decodeAndCreate(fileResult.content);
      return;
    }
    if (!importText.trim()) {
      setFeedback({ kind: "err", text: "Paste a pairings code first" });
      return;
    }
    const ok = await decodeAndCreate(importText);
    if (ok) {
      setImportOpen(false);
      setImportText("");
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 md:py-14">
      <div className="max-w-3xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 mb-6 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright transition-colors"
        >
          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8h10" strokeLinecap="round" />
          </svg>
          Main Menu
        </button>

        <div className="text-[10px] uppercase tracking-[0.5em] text-rift-gold/70 mb-2">
          Library
        </div>
        <h1 className="font-display text-3xl md:text-4xl tracking-[0.12em] text-rift-goldbright mb-2">
          Synergies &amp; Counters
        </h1>
        <p className="text-[11px] md:text-xs text-rift-mutedbright leading-snug mb-6 max-w-xl">
          Define your own champion synergies and counterpicks. Applying a
          set makes it active — the draft AI scores picks with it and the
          simulator weighs the matchups in every new series or tournament.
        </p>

        <div className="flex items-center gap-2 flex-wrap mb-5">
          <button
            type="button"
            onClick={() => setEditorTarget("new")}
            className="px-4 py-2 border border-rift-gold/70 bg-rift-gold/15 text-rift-goldbright text-[10px] uppercase tracking-[0.3em] hover:bg-rift-gold/25 transition-all"
          >
            + New Set
          </button>
          <button
            type="button"
            onClick={() => {
              if (isDesktop()) void handleImport();
              else setImportOpen(true);
            }}
            className="px-4 py-2 border border-rift-line text-rift-mutedbright text-[10px] uppercase tracking-[0.3em] hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
          >
            {isDesktop() ? "Import File" : "Import Code"}
          </button>
          {feedback && (
            <span
              className={`text-[9px] md:text-[10px] uppercase tracking-[0.25em] ${
                feedback.kind === "ok" ? "text-rift-goldbright" : "text-rift-redbright"
              }`}
            >
              {feedback.text}
            </span>
          )}
        </div>

        {pairingsPresets.length === 0 ? (
          <div className="border border-rift-line/50 bg-rift-bg/40 px-4 py-8 text-center text-[11px] text-rift-mutedbright">
            No saved synergy &amp; counter sets yet. Create one (it starts
            from the currently active pairings) or import a PAIR1: code.
          </div>
        ) : (
          <div className="space-y-2">
            {pairingsPresets.map((preset) => {
              const date = new Date(preset.updatedAt);
              const dateLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
              const isApplied = appliedId === preset.id;
              return (
                <div
                  key={preset.id}
                  className={`border bg-rift-bg/40 transition-colors ${
                    isApplied
                      ? "border-rift-gold/70"
                      : "border-rift-line/50 hover:border-rift-gold/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 px-3 pt-2.5">
                    <input
                      value={preset.name}
                      onChange={(e) =>
                        updatePairingsPreset(preset.id, { name: e.target.value })
                      }
                      className="flex-1 min-w-0 bg-transparent font-display text-sm tracking-wider text-rift-goldbright outline-none border-b border-transparent focus:border-rift-gold/40"
                      aria-label="Pairings set name"
                    />
                    <span className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 flex-shrink-0">
                      {preset.synergies.length} synergies · {preset.counters.length} counters · {dateLabel}
                    </span>
                  </div>
                  <div className="flex border-t border-rift-line/30 mt-2">
                    <button
                      type="button"
                      onClick={() => handleApply(preset.id)}
                      className={`flex-1 px-2 py-1.5 text-[9px] uppercase tracking-[0.25em] transition-colors ${
                        isApplied
                          ? "text-rift-goldbright bg-rift-gold/10"
                          : "text-rift-mutedbright/60 hover:text-rift-goldbright hover:bg-rift-gold/5"
                      }`}
                      title="Make this the active synergy & counter set"
                    >
                      {isApplied ? "Applied ✓" : "Use"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorTarget(preset.id)}
                      className="flex-1 px-2 py-1.5 text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 hover:text-rift-goldbright hover:bg-rift-gold/5 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicatePairingsPreset(preset.id)}
                      className="flex-1 px-2 py-1.5 text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 hover:text-rift-goldbright hover:bg-rift-gold/5 transition-colors"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExport(preset.id)}
                      className="flex-1 px-2 py-1.5 text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 hover:text-rift-goldbright hover:bg-rift-gold/5 transition-colors"
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(preset.id)}
                      className="flex-1 px-2 py-1.5 text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/40 hover:text-rift-redbright hover:bg-rift-red/5 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editorTarget !== null && (
        <PairingsEditor
          champions={champions}
          title={editingPreset ? editingPreset.name : "New Pairings Set"}
          // New sets seed from whatever is active right now (override or
          // baseline) so the user edits from a sensible starting point.
          initialSynergies={
            editingPreset
              ? editingPreset.synergies
              : [...getActiveSynergies()]
          }
          initialCounters={
            editingPreset
              ? editingPreset.counters
              : [...(getActiveCounterOverride() ?? HARD_COUNTERS)]
          }
          onSave={(synergies, counters) => {
            if (editorTarget === "new") {
              createPairingsPreset(
                `Pairings Set ${pairingsPresets.length + 1}`,
                synergies,
                counters,
              );
              setFeedback({ kind: "ok", text: "Pairings set saved to library" });
            } else {
              updatePairingsPreset(editorTarget, { synergies, counters });
              setFeedback({ kind: "ok", text: "Pairings set updated" });
            }
            setEditorTarget(null);
          }}
          onClose={() => setEditorTarget(null)}
        />
      )}

      {/* Web import modal. */}
      {importOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg border-2 border-rift-gold/60 bg-rift-panel p-5 md:p-6">
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
              Import Pairings
            </div>
            <h2 className="font-display text-xl tracking-wider text-rift-goldbright mb-3">
              Paste PAIR1 Code
            </h2>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="PAIR1:... or raw JSON"
              className="w-full h-28 bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs font-mono p-2 outline-none focus:border-rift-gold/60 resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setImportOpen(false);
                  setImportText("");
                }}
                className="px-3 py-1.5 border border-rift-line text-rift-mutedbright text-[10px] uppercase tracking-[0.3em] hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={!importText.trim()}
                className="px-4 py-1.5 border border-rift-gold/70 bg-rift-gold/15 text-rift-goldbright text-[10px] uppercase tracking-[0.3em] hover:bg-rift-gold/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Web export fallback when clipboard is blocked. */}
      {exportText && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg border-2 border-rift-gold/60 bg-rift-panel p-5 md:p-6">
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
              Export Pairings
            </div>
            <h2 className="font-display text-xl tracking-wider text-rift-goldbright mb-3">
              Copy This Code
            </h2>
            <textarea
              readOnly
              value={exportText}
              onFocus={(e) => e.target.select()}
              className="w-full h-28 bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs font-mono p-2 outline-none focus:border-rift-gold/60 resize-none"
            />
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setExportText(null)}
                className="px-3 py-1.5 border border-rift-line text-rift-mutedbright text-[10px] uppercase tracking-[0.3em] hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={!!confirmEntry}
        title="Delete Pairings Set?"
        message={
          confirmEntry
            ? `"${confirmEntry.name}" will be permanently removed from your library.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          if (confirmDelete) deletePairingsPreset(confirmDelete);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// ─── Editor modal ──────────────────────────────────────────────────────────
// Two tabs: Synergies (champ pair + tag + 1-3★ bonus) and Counters
// (counter → victim + severity 2-6). Rows are inline-editable; the add
// form upserts (adding an existing pair updates it in place).

function PairingsEditor({
  champions,
  title,
  initialSynergies,
  initialCounters,
  onSave,
  onClose,
}: {
  champions: Champion[];
  title: string;
  initialSynergies: Synergy[];
  initialCounters: CounterPair[];
  onSave: (synergies: Synergy[], counters: CounterPair[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"synergies" | "counters">("synergies");
  const [synergies, setSynergies] = useState<Synergy[]>(initialSynergies);
  const [counters, setCounters] = useState<CounterPair[]>(initialCounters);
  const [search, setSearch] = useState("");
  // Add forms.
  const [synA, setSynA] = useState<string | null>(null);
  const [synB, setSynB] = useState<string | null>(null);
  const [synTag, setSynTag] = useState("");
  const [synBonus, setSynBonus] = useState(2);
  const [ctrWinner, setCtrWinner] = useState<string | null>(null);
  const [ctrVictim, setCtrVictim] = useState<string | null>(null);
  const [ctrSeverity, setCtrSeverity] = useState(4);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const byAlias = useMemo(() => {
    const map = new Map<string, Champion>();
    for (const c of champions) map.set(c.alias, c);
    return map;
  }, [champions]);

  const nameOf = (alias: string) => byAlias.get(alias)?.name ?? alias;

  const matchesSearch = (aliases: string[], extra = "") => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      aliases.some(
        (a) =>
          a.toLowerCase().includes(q) ||
          nameOf(a).toLowerCase().includes(q),
      ) || extra.toLowerCase().includes(q)
    );
  };

  const addSynergy = () => {
    setFormError(null);
    if (!synA || !synB) {
      setFormError("Pick both champions");
      return;
    }
    if (synA === synB) {
      setFormError("Pick two different champions");
      return;
    }
    const champs: [string, string] = synA < synB ? [synA, synB] : [synB, synA];
    const key = `${champs[0]}|${champs[1]}`;
    const entry: Synergy = { champs, bonus: synBonus, tag: synTag.trim() };
    setSynergies((list) => {
      const without = list.filter(
        (s) => `${s.champs[0]}|${s.champs[1]}` !== key,
      );
      return [entry, ...without];
    });
    setSynA(null);
    setSynB(null);
    setSynTag("");
  };

  const addCounter = () => {
    setFormError(null);
    if (!ctrWinner || !ctrVictim) {
      setFormError("Pick both champions");
      return;
    }
    if (ctrWinner === ctrVictim) {
      setFormError("Pick two different champions");
      return;
    }
    // Counters are one-directional: if the reverse matchup already
    // exists, adding this one would contradict it (A can't counter B
    // while B counters A). Adding the SAME direction again just updates
    // the severity (handled by the upsert below).
    if (counters.some((c) => c[0] === ctrVictim && c[1] === ctrWinner)) {
      setFormError(
        `${nameOf(ctrVictim)} already counters ${nameOf(ctrWinner)} — remove that counter first`,
      );
      return;
    }
    const entry: CounterPair = [ctrWinner, ctrVictim, ctrSeverity];
    setCounters((list) => {
      const without = list.filter(
        (c) => !(c[0] === ctrWinner && c[1] === ctrVictim),
      );
      return [entry, ...without];
    });
    setCtrWinner(null);
    setCtrVictim(null);
  };

  const visibleSynergies = synergies.filter((s) =>
    matchesSearch([s.champs[0], s.champs[1]], s.tag),
  );
  const visibleCounters = counters.filter((c) => matchesSearch([c[0], c[1]]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-2 md:px-4 py-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col border-2 border-rift-gold/60 bg-rift-panel">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-rift-line/40">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-0.5">
              Pairings Editor
            </div>
            <h2 className="font-display text-lg md:text-xl tracking-wider text-rift-goldbright truncate">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-rift-line text-rift-mutedbright text-[10px] uppercase tracking-[0.3em] hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(synergies, counters)}
              className="px-4 py-1.5 border border-rift-gold/70 bg-rift-gold/15 text-rift-goldbright text-[10px] uppercase tracking-[0.3em] hover:bg-rift-gold/25 transition-all"
            >
              Save
            </button>
          </div>
        </div>

        {/* Tabs + search */}
        <div className="flex items-center gap-2 px-4 md:px-5 py-2.5 border-b border-rift-line/40 flex-wrap">
          <button
            type="button"
            onClick={() => setTab("synergies")}
            className={`px-3 py-1.5 border text-[10px] uppercase tracking-[0.25em] transition-all ${
              tab === "synergies"
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"
            }`}
          >
            Synergies ({synergies.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("counters")}
            className={`px-3 py-1.5 border text-[10px] uppercase tracking-[0.25em] transition-all ${
              tab === "counters"
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"
            }`}
          >
            Counters ({counters.length})
          </button>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search champion or tag…"
            className="flex-1 min-w-[140px] bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs px-2 py-1.5 outline-none focus:border-rift-gold/60"
          />
          <button
            type="button"
            onClick={() =>
              tab === "synergies" ? setSynergies([]) : setCounters([])
            }
            className="px-3 py-1.5 border border-rift-line text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/60 hover:text-rift-redbright hover:border-rift-red/50 transition-all"
            title={`Remove every ${tab === "synergies" ? "synergy" : "counter"} in this set`}
          >
            Clear All
          </button>
        </div>

        {/* Add form */}
        <div className="px-4 md:px-5 py-3 border-b border-rift-line/40 bg-rift-bg/30">
          {tab === "synergies" ? (
            <div className="flex items-end gap-2 flex-wrap">
              <ChampPicker
                label="Champion A"
                champions={champions}
                value={synA}
                onChange={setSynA}
              />
              <ChampPicker
                label="Champion B"
                champions={champions}
                value={synB}
                onChange={setSynB}
              />
              <label className="flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
                  Tag
                </span>
                <input
                  value={synTag}
                  onChange={(e) => setSynTag(e.target.value)}
                  placeholder="e.g. AoE Lockdown"
                  className="w-36 bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs px-2 py-1.5 outline-none focus:border-rift-gold/60"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
                  Bonus
                </span>
                <select
                  value={synBonus}
                  onChange={(e) => setSynBonus(Number(e.target.value))}
                  className="bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs px-2 py-1.5 outline-none focus:border-rift-gold/60 [&>option]:bg-rift-panel [&>option]:text-rift-mutedbright"
                >
                  {Array.from(
                    { length: SYNERGY_BONUS_MAX - SYNERGY_BONUS_MIN + 1 },
                    (_, i) => SYNERGY_BONUS_MIN + i,
                  ).map((b) => (
                    <option key={b} value={b}>
                      {"★".repeat(b)} ({b})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={addSynergy}
                className="px-4 py-1.5 border border-rift-gold/70 bg-rift-gold/15 text-rift-goldbright text-[10px] uppercase tracking-[0.3em] hover:bg-rift-gold/25 transition-all"
              >
                Add
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-2 flex-wrap">
              <ChampPicker
                label="Counter (wins lane)"
                champions={champions}
                value={ctrWinner}
                onChange={setCtrWinner}
              />
              <span className="pb-1.5 text-rift-gold/60 text-xs">beats</span>
              <ChampPicker
                label="Victim"
                champions={champions}
                value={ctrVictim}
                onChange={setCtrVictim}
              />
              <label className="flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
                  Severity
                </span>
                <select
                  value={ctrSeverity}
                  onChange={(e) => setCtrSeverity(Number(e.target.value))}
                  className="bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs px-2 py-1.5 outline-none focus:border-rift-gold/60 [&>option]:bg-rift-panel [&>option]:text-rift-mutedbright"
                >
                  {Array.from(
                    { length: COUNTER_SEVERITY_MAX - COUNTER_SEVERITY_MIN + 1 },
                    (_, i) => COUNTER_SEVERITY_MIN + i,
                  ).map((s) => (
                    <option key={s} value={s}>
                      {s} {s >= 5 ? "(extreme)" : s >= 4 ? "(hard)" : "(medium)"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={addCounter}
                className="px-4 py-1.5 border border-rift-gold/70 bg-rift-gold/15 text-rift-goldbright text-[10px] uppercase tracking-[0.3em] hover:bg-rift-gold/25 transition-all"
              >
                Add
              </button>
            </div>
          )}
          {formError && (
            <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-rift-redbright">
              {formError}
            </div>
          )}
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto px-4 md:px-5 py-3">
          {tab === "synergies" ? (
            visibleSynergies.length === 0 ? (
              <div className="py-8 text-center text-[11px] text-rift-mutedbright">
                {synergies.length === 0
                  ? "No synergies in this set yet — add one above."
                  : "No synergies match your search."}
              </div>
            ) : (
              <div className="space-y-1.5">
                {visibleSynergies.map((s) => {
                  const key = `${s.champs[0]}|${s.champs[1]}`;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-2 border border-rift-line/40 bg-rift-bg/40 px-2 py-1.5"
                    >
                      <ChampLabel champion={byAlias.get(s.champs[0])} alias={s.champs[0]} />
                      <span className="text-rift-gold/50 text-[10px]">+</span>
                      <ChampLabel champion={byAlias.get(s.champs[1])} alias={s.champs[1]} />
                      <input
                        value={s.tag}
                        onChange={(e) =>
                          setSynergies((list) =>
                            list.map((x) =>
                              `${x.champs[0]}|${x.champs[1]}` === key
                                ? { ...x, tag: e.target.value }
                                : x,
                            ),
                          )
                        }
                        placeholder="tag"
                        className="flex-1 min-w-[80px] bg-transparent border-b border-transparent focus:border-rift-gold/40 text-rift-mutedbright text-[11px] px-1 outline-none"
                      />
                      <select
                        value={s.bonus}
                        onChange={(e) =>
                          setSynergies((list) =>
                            list.map((x) =>
                              `${x.champs[0]}|${x.champs[1]}` === key
                                ? { ...x, bonus: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                        className="bg-rift-bg/60 border border-rift-line text-rift-goldbright text-[11px] px-1 py-0.5 outline-none focus:border-rift-gold/60 [&>option]:bg-rift-panel [&>option]:text-rift-mutedbright"
                        aria-label="Synergy bonus"
                      >
                        {[1, 2, 3].map((b) => (
                          <option key={b} value={b}>
                            {"★".repeat(b)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setSynergies((list) =>
                            list.filter(
                              (x) => `${x.champs[0]}|${x.champs[1]}` !== key,
                            ),
                          )
                        }
                        className="px-1.5 text-rift-mutedbright/50 hover:text-rift-redbright transition-colors"
                        title="Remove synergy"
                        aria-label="Remove synergy"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : visibleCounters.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-rift-mutedbright">
              {counters.length === 0
                ? "No counters in this set yet — add one above."
                : "No counters match your search."}
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleCounters.map((c) => {
                const key = `${c[0]}|${c[1]}`;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 border border-rift-line/40 bg-rift-bg/40 px-2 py-1.5"
                  >
                    <ChampLabel champion={byAlias.get(c[0])} alias={c[0]} />
                    <span className="text-rift-redbright/70 text-[9px] uppercase tracking-[0.2em]">
                      beats
                    </span>
                    <ChampLabel champion={byAlias.get(c[1])} alias={c[1]} />
                    <div className="flex-1" />
                    <select
                      value={c[2]}
                      onChange={(e) =>
                        setCounters((list) =>
                          list.map((x): CounterPair =>
                            x[0] === c[0] && x[1] === c[1]
                              ? [x[0], x[1], Number(e.target.value)]
                              : x,
                          ),
                        )
                      }
                      className="bg-rift-bg/60 border border-rift-line text-rift-goldbright text-[11px] px-1 py-0.5 outline-none focus:border-rift-gold/60 [&>option]:bg-rift-panel [&>option]:text-rift-mutedbright"
                      aria-label="Counter severity"
                    >
                      {Array.from(
                        { length: COUNTER_SEVERITY_MAX - COUNTER_SEVERITY_MIN + 1 },
                        (_, i) => COUNTER_SEVERITY_MIN + i,
                      ).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setCounters((list) =>
                          list.filter((x) => !(x[0] === c[0] && x[1] === c[1])),
                        )
                      }
                      className="px-1.5 text-rift-mutedbright/50 hover:text-rift-redbright transition-colors"
                      title="Remove counter"
                      aria-label="Remove counter"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Champion icon + name pill used in editor rows.
function ChampLabel({
  champion,
  alias,
}: {
  champion: Champion | undefined;
  alias: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 flex-shrink-0">
      {champion?.iconUrl && (

        <img
          src={champion.iconUrl}
          alt=""
          className="w-5 h-5 border border-rift-line/60"
        />
      )}
      <span className="text-[11px] text-rift-goldbright whitespace-nowrap">
        {champion?.name ?? alias}
      </span>
    </span>
  );
}

// Minimal searchable champion select: an input that filters a dropdown
// list. Selecting fills the input with the champion name; clearing the
// text clears the selection.
function ChampPicker({
  label,
  champions,
  value,
  onChange,
}: {
  label: string;
  champions: Champion[];
  value: string | null;
  onChange: (alias: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = value ? champions.find((c) => c.alias === value) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return champions.slice(0, 30);
    return champions
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.alias.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [champions, query]);

  return (
    <label className="flex flex-col gap-1 relative">
      <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        {selected?.iconUrl && (

          <img
            src={selected.iconUrl}
            alt=""
            className="w-6 h-6 border border-rift-gold/40"
          />
        )}
        <input
          value={open ? query : selected?.name ?? ""}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
            if (e.target.value === "") onChange(null);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onBlur={() => {
            // Delay so option mousedown can fire first.
            setTimeout(() => setOpen(false), 120);
          }}
          placeholder="Search…"
          className="w-32 bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs px-2 py-1.5 outline-none focus:border-rift-gold/60"
        />
      </div>
      {open && (
        <div className="absolute top-full left-0 z-20 mt-1 w-52 max-h-56 overflow-y-auto border border-rift-gold/50 bg-rift-panel shadow-xl">
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-rift-mutedbright">
              No champions match
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.alias}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(c.alias);
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-rift-gold/10 transition-colors"
              >
                { }
                <img
                  src={c.iconUrl}
                  alt=""
                  className="w-5 h-5 border border-rift-line/60"
                />
                <span className="text-[11px] text-rift-mutedbright">
                  {c.name}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </label>
  );
}
