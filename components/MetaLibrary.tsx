"use client";

import { useEffect, useMemo, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import {
  decodeMetaOverride,
  encodeMetaOverride,
  type MetaOverride,
} from "@/lib/championMeta";
import { isDesktop, openFileNative, saveFileNative } from "@/lib/desktopStorage";
import MetaEditor from "./MetaEditor";
import Modal from "./Modal";

// Main-menu section: the user's library of saved meta tier lists. Each
// preset is a full MetaOverride that can be created/edited in the
// drag-and-drop MetaEditor, duplicated, exported/imported as a META1:
// code (file on desktop, clipboard/textarea on web), and applied as the
// ACTIVE meta — which is what new series and tournaments snapshot.

interface Props {
  onBack: () => void;
}

export default function MetaLibrary({ onBack }: Props) {
  const champions = useDraftStore((s) => s.champions);
  const metaPresets = useDraftStore((s) => s.metaPresets);
  const createMetaPreset = useDraftStore((s) => s.createMetaPreset);
  const updateMetaPreset = useDraftStore((s) => s.updateMetaPreset);
  const deleteMetaPreset = useDraftStore((s) => s.deleteMetaPreset);
  const duplicateMetaPreset = useDraftStore((s) => s.duplicateMetaPreset);
  const applyMetaPreset = useDraftStore((s) => s.applyMetaPreset);

  // Which preset the MetaEditor modal is editing: null = closed,
  // "new" = creating a fresh tier list, otherwise a preset id.
  const [editorTarget, setEditorTarget] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Web import/export fallbacks (desktop uses native file dialogs).
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [exportText, setExportText] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  // Transient highlight on the preset that was just applied.
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
      ? metaPresets.find((p) => p.id === editorTarget) ?? null
      : null;
  const confirmEntry = confirmDelete
    ? metaPresets.find((p) => p.id === confirmDelete)
    : null;

  const handleApply = (id: string) => {
    applyMetaPreset(id);
    setAppliedId(id);
    setFeedback({
      kind: "ok",
      text: "Tier list applied — new series & tournaments will use it",
    });
  };

  const handleExport = async (presetId: string) => {
    const preset = metaPresets.find((p) => p.id === presetId);
    if (!preset) return;
    let code: string;
    try {
      code = await encodeMetaOverride(preset.override);
    } catch (e) {
      setFeedback({
        kind: "err",
        text: `Encode failed: ${e instanceof Error ? e.message : "unknown"}`,
      });
      return;
    }
    if (isDesktop()) {
      const safeName = preset.name.replace(/[/\\:*?"<>|]/g, "_") || "tier-list";
      const result = await saveFileNative({
        defaultPath: `${safeName}.meta.json`,
        filters: [{ name: "DraftSim Meta", extensions: ["json"] }],
        content: code,
      });
      if (result.ok) {
        setFeedback({ kind: "ok", text: "Tier list saved to file" });
      } else if (result.error && result.error !== "cancelled") {
        setFeedback({ kind: "err", text: `Save failed: ${result.error}` });
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setFeedback({ kind: "ok", text: "Meta code copied to clipboard" });
    } catch {
      setExportText(code);
    }
  };

  const importDecoded = (
    override: MetaOverride,
    championCount: number,
    skippedEntries: number,
  ) => {
    const name = `Imported Tier List ${metaPresets.length + 1}`;
    createMetaPreset(name, override);
    const skipped = skippedEntries ? ` (${skippedEntries} skipped)` : "";
    setFeedback({
      kind: "ok",
      text: `Imported ${championCount} champions as "${name}"${skipped}`,
    });
  };

  const handleImport = async () => {
    if (isDesktop()) {
      const fileResult = await openFileNative({
        filters: [{ name: "DraftSim Meta", extensions: ["json"] }],
      });
      if (!fileResult.ok || fileResult.content == null) {
        if (fileResult.error && fileResult.error !== "cancelled") {
          setFeedback({ kind: "err", text: fileResult.error });
        }
        return;
      }
      const result = await decodeMetaOverride(fileResult.content, validAliases);
      if (result.error || !result.override) {
        setFeedback({ kind: "err", text: result.error ?? "Decode failed" });
        return;
      }
      importDecoded(result.override, result.championCount, result.skippedEntries);
      return;
    }
    if (!importText.trim()) {
      setFeedback({ kind: "err", text: "Paste a meta code first" });
      return;
    }
    const result = await decodeMetaOverride(importText, validAliases);
    if (result.error || !result.override) {
      setFeedback({ kind: "err", text: result.error ?? "Decode failed" });
      return;
    }
    setImportOpen(false);
    setImportText("");
    importDecoded(result.override, result.championCount, result.skippedEntries);
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
          Meta Tier Lists
        </h1>
        <p className="text-[11px] md:text-xs text-rift-mutedbright leading-snug mb-6 max-w-xl">
          Build and save your own tier lists. Applying one makes it the
          active meta — the AI drafts with it and every new series or
          tournament snapshots it.
        </p>

        <div className="flex items-center gap-2 flex-wrap mb-5">
          <button
            type="button"
            onClick={() => setEditorTarget("new")}
            className="px-4 py-2 border border-rift-gold/70 bg-rift-gold/15 text-rift-goldbright text-[10px] uppercase tracking-[0.3em] hover:bg-rift-gold/25 transition-all"
          >
            + New Tier List
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

        {metaPresets.length === 0 ? (
          <div className="border border-rift-line/50 bg-rift-bg/40 px-4 py-8 text-center text-[11px] text-rift-mutedbright">
            No saved tier lists yet. Create one with the editor, or import
            a META1: code.
          </div>
        ) : (
          <div className="space-y-2">
            {metaPresets.map((preset) => {
              const championCount = Object.keys(preset.override).length;
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
                        updateMetaPreset(preset.id, { name: e.target.value })
                      }
                      className="flex-1 min-w-0 bg-transparent font-display text-sm tracking-wider text-rift-goldbright outline-none border-b border-transparent focus:border-rift-gold/40"
                      aria-label="Tier list name"
                    />
                    <span className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 flex-shrink-0">
                      {championCount} champions · {dateLabel}
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
                      title="Make this the active meta"
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
                      onClick={() => duplicateMetaPreset(preset.id)}
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

      {/* Editor — "new" creates a preset on save; otherwise updates the
          targeted preset. Seeding: a new list starts from the currently
          ACTIVE meta (initialOverride null → MetaEditor seeds from
          getMetaTier), an edit starts from the preset itself. */}
      <MetaEditor
        open={editorTarget !== null}
        champions={champions}
        initialOverride={editingPreset ? editingPreset.override : null}
        onSave={(override) => {
          if (editorTarget === "new") {
            createMetaPreset(`Tier List ${metaPresets.length + 1}`, override);
            setFeedback({ kind: "ok", text: "Tier list saved to library" });
          } else if (editorTarget) {
            updateMetaPreset(editorTarget, { override });
            setFeedback({ kind: "ok", text: "Tier list updated" });
          }
        }}
        onClose={() => setEditorTarget(null)}
      />

      {/* Web import modal — paste a META1: code or raw JSON. */}
      {importOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg border-2 border-rift-gold/60 bg-rift-panel p-5 md:p-6">
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
              Import Tier List
            </div>
            <h2 className="font-display text-xl tracking-wider text-rift-goldbright mb-3">
              Paste META1 Code
            </h2>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="META1:... or raw JSON"
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
              Export Tier List
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
        title="Delete Tier List?"
        message={
          confirmEntry
            ? `"${confirmEntry.name}" will be permanently removed from your library.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          if (confirmDelete) deleteMetaPreset(confirmDelete);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
