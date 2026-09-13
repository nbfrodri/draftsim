"use client";
import { previewRealityImport, type RealityImportPreview } from "@/lib/importPreview";

import { memo,useCallback,useEffect,useRef,useState } from "react";

import {
compactDesktopDatabase,
formatCompactResultMessage,
} from "@/lib/desktopSqlite";
import { isDesktop,openFileNative,saveFileNative,isDesktopOperationBlocking,signalReviewingImport,waitForDesktopOverlayPaint,clearDesktopOperation } from "@/lib/desktopStorage";
import { REALITY_CODE_PREFIX } from "@/lib/realityShare";
import { useDraftStore } from "@/store/draftStore";
import Modal from "./Modal";
import { advanceOperationProgress, recordOperationSuccess } from "@/lib/operationProgress";

interface CommunityEntry {
  id: string;
  title: string;
  author: string;
  description: string;
  tags?: string[];
  code?: string;
  featured?: boolean;
}

interface CommunityManifest {
  version: number;
  entries: CommunityEntry[];
}

/** Slim list row — never holds season/history payloads in the hub render path. */
type RealityListItem = {
  id: string;
  name: string;
  year: number;
  complete: boolean;
};

type RealityListSource = ReadonlyArray<{
  id: string;
  name: string;
  year: number;
  season?: { status?: string } | null;
}>;

function buildRealityList(realities: RealityListSource): RealityListItem[] {
  return realities.map((r) => ({
    id: r.id,
    name: r.name,
    year: r.year,
    complete: r.season?.status === "complete",
  }));
}

function realityListEqual(a: RealityListItem[], b: RealityListItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.name !== y.name ||
      x.year !== y.year ||
      x.complete !== y.complete
    ) {
      return false;
    }
  }
  return true;
}

// useSyncExternalStore requires a stable getSnapshot result. Cache by the
// realities array identity, and reuse the previous list object when the
// visible fields are unchanged (avoids infinite re-render loops).
let realityListCacheInput: RealityListSource | null = null;
let realityListCacheOutput: RealityListItem[] = [];

function selectRealityListCached(realities: RealityListSource): RealityListItem[] {
  if (realities === realityListCacheInput) return realityListCacheOutput;
  const next = buildRealityList(realities);
  if (realityListEqual(realityListCacheOutput, next)) {
    realityListCacheInput = realities;
    return realityListCacheOutput;
  }
  realityListCacheInput = realities;
  realityListCacheOutput = next;
  return next;
}

interface Props {
  onChoose: (view: "season-setup" | "menu") => void;
}

const RealityRow = memo(function RealityRow({
  item,
  active,
  confirmDelete,
  busy,
  onOpen,
  onExport,
  onShare,
  onAskDelete,
  onConfirmDelete,
}: {
  item: RealityListItem;
  active: boolean;
  confirmDelete: boolean;
  busy: boolean;
  onOpen: (id: string) => void;
  onExport: (id: string) => void;
  onShare: (id: string) => void;
  onAskDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 border ${
        active ? "border-rift-blue/50 bg-rift-blue/[0.06]" : "border-rift-line/40 bg-rift-bg/30"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-rift-mutedbright truncate">{item.name}</div>
        <div className="text-[9px] uppercase tracking-[0.2em] text-rift-muted/55">
          Year {item.year} · {item.complete ? "offseason ready" : "in progress"}
          {active ? " · active" : ""}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onOpen(item.id)}
        className="px-3 py-1 border border-rift-gold/60 bg-rift-gold/10 text-rift-goldbright text-[9px] uppercase tracking-[0.2em] hover:bg-rift-gold/20 transition-all disabled:opacity-50"
      >
        {active ? "Resume" : "Open"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onExport(item.id)}
        title="Export this reality (timeline + its season history) to a file"
        className="px-2 py-1 border border-rift-line text-rift-mutedbright text-[9px] uppercase tracking-[0.2em] hover:border-rift-gold/50 hover:text-rift-goldbright transition-all disabled:opacity-50"
      >
        Export
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onShare(item.id)}
        title="Copy a REAL1: share code to clipboard"
        className="px-2 py-1 border border-rift-line text-rift-mutedbright text-[9px] uppercase tracking-[0.2em] hover:border-rift-gold/50 hover:text-rift-goldbright transition-all disabled:opacity-50"
      >
        REAL1
      </button>
      {confirmDelete ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirmDelete(item.id)}
          className="px-2 py-1 border border-rift-red/60 text-rift-redbright text-[9px] uppercase tracking-[0.2em] disabled:opacity-50"
        >
          Confirm
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAskDelete(item.id)}
          className="px-2 py-1 border border-rift-line text-rift-muted text-[9px] uppercase tracking-[0.2em] hover:border-rift-red/50 hover:text-rift-redbright transition-all disabled:opacity-50"
        >
          Delete
        </button>
      )}
    </div>
  );
});

export default function RealitiesHub({ onChoose }: Props) {
  const realityList = useDraftStore((s) => selectRealityListCached(s.realities));
  const activeRealityId = useDraftStore((s) => s.activeRealityId);
  const beginNewReality = useDraftStore((s) => s.beginNewReality);
  const switchReality = useDraftStore((s) => s.switchReality);
  const deleteReality = useDraftStore((s) => s.deleteReality);
  const exportReality = useDraftStore((s) => s.exportReality);
  const exportRealityShareCode = useDraftStore((s) => s.exportRealityShareCode);
  const importReality = useDraftStore((s) => s.importReality);
  const [preview, setPreview] = useState<RealityImportPreview | null>(null);
  const previewTarget = useRef<unknown>(null);

  const [name, setName] = useState("");
  const [aging, setAging] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [compactPromptOpen, setCompactPromptOpen] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [rowBusy, setRowBusy] = useState(false);
  const deletingRef = useRef(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [shareCodeInput, setShareCodeInput] = useState("");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [gallery, setGallery] = useState<CommunityEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch("/community-realities/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((m: CommunityManifest | null) => {
        if (m?.entries) setGallery(m.entries);
      })
      .catch(() => {});
  }, []);

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }, []);

  const create = () => {
    beginNewReality(name || "My Reality", aging);
    onChoose("season-setup");
  };

  const handleExport = useCallback(
    async (id: string) => {
      if (rowBusy) return;
      setRowBusy(true);
      try {
        // Yield so the button disable paints before heavy stringify.
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        const json = await exportReality(id);
        if (!json) {
          flash("err", "Export failed");
          return;
        }
        const item = realityList.find((x) => x.id === id);
        const safe =
          (item?.name ?? "reality").replace(/[/\\:*?"<>|]/g, "_").trim() ||
          "reality";
        const filename = `${safe}.draftsim-reality.json`;
        if (isDesktop()) {
          const res = await saveFileNative({
            defaultPath: filename,
            filters: [{ name: "DraftSim Reality", extensions: ["json"] }],
            content: json,
          });
          if (res.ok) flash("ok", "Reality exported");
          else if (res.error !== "cancelled")
            flash("err", res.error ? `Export failed: ${res.error}` : "Export failed");
          return;
        }
        const url = URL.createObjectURL(
          new Blob([json], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        flash("ok", "Reality exported");
      } finally {
        setRowBusy(false);
      }
    },
    [exportReality, flash, realityList, rowBusy],
  );

  const prepareImport = async (read: () => Promise<string | null>) => {
    if (isDesktopOperationBlocking()) return;
    signalReviewingImport();
    setRowBusy(true);
    try {
      await waitForDesktopOverlayPaint();
      const text = await read();
      if (text === null) return;
      const plan = await previewRealityImport(text, useDraftStore.getState().realities, async stage => {
        advanceOperationProgress(stage);
        await waitForDesktopOverlayPaint();
      });
      previewTarget.current = useDraftStore.getState().realities.find(r => r.id === plan.id);
      setPreview(plan);
      recordOperationSuccess();
    } catch (error) { flash("err", error instanceof Error ? error.message : "Import failed"); }
    finally { clearDesktopOperation(); setRowBusy(false); }
  };
  const applyImport = (text: string) => prepareImport(async () => text);
  const applyShareCode = async () => { if (shareCodeInput.trim()) await applyImport(shareCodeInput); };

  const copyShareCode = useCallback(
    async (id: string) => {
      if (rowBusy) return;
      setRowBusy(true);
      try {
        const code = await exportRealityShareCode(id);
        if (!code) {
          flash("err", "Could not build share code");
          return;
        }
        try {
          await navigator.clipboard.writeText(code);
          flash("ok", "REAL1 code copied");
        } catch {
          flash("err", "Copy failed — select code manually");
        }
      } finally {
        setRowBusy(false);
      }
    },
    [exportRealityShareCode, flash, rowBusy],
  );

  const handleImport = async () => {
    if (isDesktop()) {
      await prepareImport(async () => {
        const res = await openFileNative({ filters: [{ name: "DraftSim Reality", extensions: ["json"] }] });
        if (!res.ok || res.content == null) {
          if (res.error && res.error !== "cancelled") throw new Error(res.error);
          return null;
        }
        return res.content;
      });
      return;
    }
    fileInputRef.current?.click();
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await prepareImport(() => file.text());
  };

  const handleOpen = useCallback(
    async (id: string) => {
      if (rowBusy) return;
      setRowBusy(true);
      try {
        await switchReality(id);
      } finally {
        setRowBusy(false);
      }
    },
    [rowBusy, switchReality],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (rowBusy || deletingRef.current) return;
      deletingRef.current = true;
      setRowBusy(true);
      setDeleteError(null);
      try {
        const result = await deleteReality(id);
        setConfirmDelete(null);
        flash("ok", "Reality deleted");
        if (result?.suggestCompact) setCompactPromptOpen(true);
      } catch (error) {
        setDeleteError(error instanceof Error ? error.message : String(error));
      } finally {
        deletingRef.current = false;
        setRowBusy(false);
      }
    },
    [deleteReality, flash, rowBusy],
  );
  const handleCompactDatabase = async () => {
    if (!isDesktop() || compacting) return;
    setCompacting(true);
    try {
      const result = await compactDesktopDatabase();
      flash(
        "ok",
        result ? formatCompactResultMessage(result) : "Database compacted",
      );
    } catch {
      flash("err", "Compact failed");
    } finally {
      setCompacting(false);
    }
  };

  const handleCompactAfterDelete = async () => {
    setCompactPromptOpen(false);
    await handleCompactDatabase();
  };

  return (
    <div className="min-h-[100svh] overflow-y-auto flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-1">
          <button
            type="button"
            onClick={() => onChoose("menu")}
            className="text-[10px] uppercase tracking-[0.3em] text-rift-muted hover:text-rift-goldbright transition-all"
          >
            ← Menu
          </button>
        </div>
        <h1 className="font-display text-2xl tracking-[0.15em] text-rift-goldbright">
          Realities
        </h1>
        <p className="text-[11px] text-rift-muted/70 mb-6 leading-relaxed">
          A continuous timeline. The same teams and players carry across seasons —
          each year ends at Worlds, an offseason transfer window reshapes rosters,
          and the next season begins. Records and careers accumulate forever.
        </p>

        <div className="border border-rift-gold/30 bg-rift-gold/[0.03] mb-6">
          <div className="px-3 py-1.5 border-b border-rift-gold/25 text-[10px] uppercase tracking-[0.3em] text-rift-goldbright">
            New Reality
          </div>
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Reality name…"
                className="flex-1 min-w-0 bg-rift-bg/50 border border-rift-line/50 px-2 py-1.5 text-[12px] text-rift-mutedbright placeholder:text-rift-muted/40 focus:border-rift-gold/50 outline-none"
              />
              <button
                type="button"
                onClick={create}
                className="px-4 py-1.5 border border-rift-gold bg-rift-gold/10 text-rift-goldbright text-[10px] uppercase tracking-[0.25em] hover:bg-rift-gold/20 transition-all"
              >
                Create →
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAging((v) => !v)}
              className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright hover:text-rift-goldbright transition-all"
              title="Each offseason: young players grow, veterans decline; consistent underperformers go to academy → free agency → retire if unsigned. Off = rosters change only via transfers."
            >
              <span
                className={`w-3.5 h-3.5 border flex items-center justify-center text-[9px] ${
                  aging
                    ? "border-rift-gold/70 bg-rift-gold/15 text-rift-goldbright"
                    : "border-rift-line text-transparent"
                }`}
              >
                ✓
              </span>
              Player aging, demotions &amp; rookies {aging ? "ON" : "OFF"}
            </button>
            <p className="text-[9px] text-rift-muted/55">
              Next you&apos;ll configure the first season (leagues, formats, real names).
              See <span className="text-rift-gold/70">docs/reality-sharing.md</span> for REAL1
              share codes.
            </p>
          </div>
        </div>

        <div className="border border-rift-line/40 bg-rift-bg/20 mb-6 p-3">
          <div className="text-[10px] uppercase tracking-[0.3em] text-rift-gold/70 mb-2">
            Import share code
          </div>
          <div className="flex gap-2 flex-wrap">
            <input
              value={shareCodeInput}
              onChange={(e) => setShareCodeInput(e.target.value)}
              placeholder={`${REALITY_CODE_PREFIX}… or paste JSON`}
              className="flex-1 min-w-[200px] bg-rift-bg/50 border border-rift-line/50 px-2 py-1.5 text-[11px] text-rift-mutedbright placeholder:text-rift-muted/40 focus:border-rift-gold/50 outline-none font-mono"
            />
            <button
              type="button"
              onClick={() => void applyShareCode()}
              className="px-3 py-1.5 border border-rift-gold/60 bg-rift-gold/10 text-rift-goldbright text-[9px] uppercase tracking-[0.2em] hover:bg-rift-gold/20 transition-all"
            >
              Import code
            </button>
          </div>
        </div>

        <div className="mb-6">
          <button
            type="button"
            onClick={() => setGalleryOpen((v) => !v)}
            className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/80 hover:text-rift-goldbright transition-colors mb-2"
          >
            {galleryOpen ? "▾" : "▸"} Community gallery
            {gallery.length > 0 ? ` (${gallery.length})` : ""}
          </button>
          {galleryOpen && (
            <div className="space-y-2 border border-rift-line/40 bg-rift-bg/20 p-3">
              {gallery.length === 0 ? (
                <p className="text-[10px] text-rift-muted/60 italic">
                  No curated entries — add manifests under public/community-realities/
                </p>
              ) : (
                gallery.map((entry) => (
                  <div
                    key={entry.id}
                    className="border border-rift-line/30 bg-rift-bg/30 px-2 py-2"
                  >
                    <div className="flex items-start gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-rift-goldbright">{entry.title}</div>
                        <div className="text-[9px] text-rift-muted/60">
                          by {entry.author}
                          {entry.featured ? " · featured" : ""}
                        </div>
                        <p className="text-[10px] text-rift-mutedbright/80 mt-1 leading-snug">
                          {entry.description}
                        </p>
                        {entry.tags && entry.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {entry.tags.map((t) => (
                              <span
                                key={t}
                                className="text-[7px] uppercase tracking-[0.15em] text-rift-muted/50 border border-rift-line/40 px-1"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {entry.code ? (
                        <button
                          type="button"
                          onClick={() => {
                            setShareCodeInput(entry.code!);
                            void applyImport(entry.code!);
                          }}
                          className="px-2 py-1 border border-rift-gold/60 bg-rift-gold/10 text-rift-goldbright text-[8px] uppercase tracking-[0.2em] hover:bg-rift-gold/20"
                        >
                          Import
                        </button>
                      ) : (
                        <span className="text-[8px] text-rift-muted/45 uppercase tracking-[0.15em]">
                          Paste REAL1 code
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <span className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/55">
            Saved realities {realityList.length > 0 ? `(${realityList.length})` : ""}
          </span>
          {msg && (
            <span
              className={`text-[9px] uppercase tracking-[0.2em] ${
                msg.kind === "ok" ? "text-rift-goldbright" : "text-rift-redbright"
              }`}
            >
              {msg.text}
            </span>
          )}
          {isDesktop() && (
            <button
              type="button"
              onClick={() => void handleCompactDatabase()}
              disabled={compacting}
              title="Reclaim disk space after deleting large realities (runs SQLite VACUUM)"
              className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright transition-colors disabled:opacity-50"
            >
              Compact database
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleImport()}
            title="Import a reality exported from DraftSim (its timeline + that reality's season history)"
            className="ml-auto text-[9px] uppercase tracking-[0.3em] text-rift-gold/80 hover:text-rift-goldbright transition-colors"
          >
            Import (.json)
          </button>
        </div>
        {isDesktop() && (
          <p className="text-[9px] text-rift-muted/55 mb-2 leading-relaxed">
            After deleting a large reality, use{" "}
            <span className="text-rift-gold/70">Compact database</span> to shrink the
            on-disk save file and free space. Imported realities are stored
            compact-encoded in the database (same compression as the JSON export).
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => void onFilePicked(e)}
        />
        {deleteError && <p role="alert" className="mb-3 text-xs text-rift-redbright">Could not delete the reality: {deleteError} Resolve the error and press Confirm to retry.</p>}
        {realityList.length === 0 ? (
          <div className="text-[11px] italic text-rift-muted/60">
            No realities yet — create one above.
          </div>
        ) : (
          <div className="space-y-1.5">
            {realityList.map((item) => (
              <RealityRow
                key={item.id}
                item={item}
                active={item.id === activeRealityId}
                confirmDelete={confirmDelete === item.id}
                busy={rowBusy}
                onOpen={handleOpen}
                onExport={handleExport}
                onShare={copyShareCode}
                onAskDelete={setConfirmDelete}
                onConfirmDelete={(id) => void handleDelete(id)}
              />
            ))}
          </div>
        )}
      </div>

      <Modal open={preview !== null} title="Review reality import"
        message="Check the archive details before adding it to your saved realities."
        confirmLabel="Import" onCancel={() => setPreview(null)} onConfirm={() => {
          if (!preview || rowBusy) return;
          if (useDraftStore.getState().realities.find(r => r.id === preview.id) !== previewTarget.current) {
            flash("err", "The target reality changed. Review the import again."); setPreview(null); return;
          }
          const plan = preview; setPreview(null); setRowBusy(true);
          void importReality(plan.json).then(res => {
            if (res.ok) { flash("ok", "Reality imported"); setShareCodeInput(""); }
            else flash("err", res.error ?? "Import failed");
          }).catch(error => flash("err", String(error))).finally(() => setRowBusy(false));
        }}>
        {preview && <div className="mb-6 space-y-4 text-left">
          <div className="border border-rift-gold/30 bg-rift-gold/[0.04] p-4">
            <p className="text-[9px] uppercase tracking-[0.2em] text-rift-gold">Reality archive</p>
            <h3 className="mt-2 break-words font-display text-xl text-rift-goldbright">{preview.name}</h3>
            <dl className="mt-4 grid grid-cols-3 divide-x divide-rift-gold/20 border-t border-rift-gold/20 pt-3 text-center">
              {[ ["Current year", preview.year], ["Archived seasons", preview.archivedYears], ["Teams", preview.teams.length] ].map(([label, value]) => <div key={label}><dt className="text-[9px] uppercase tracking-wider text-rift-mutedbright">{label}</dt><dd className="mt-1 font-display text-xl tabular-nums text-rift-goldbright">{value}</dd></div>)}
            </dl>
          </div>
          <div className={`border-l-2 p-3 text-sm leading-relaxed ${preview.replaces ? "border-rift-red bg-rift-red/5 text-rift-redbright" : "border-rift-blue bg-rift-blue/5 text-rift-mutedbright"}`}>
            <p className="font-medium">{preview.replaces ? "Replaces an existing reality" : "Adds a new reality"}</p>
            <p className="mt-1 text-xs">{preview.replaces ? `"${preview.replaces}" and its history will be replaced. A safety backup is created first.` : "Your existing realities and their history will be preserved."}</p>
          </div>
          <details className="border border-rift-line p-3">
            <summary className="cursor-pointer text-xs text-rift-goldbright">Included teams ({preview.teams.length})</summary>
            <ul className="mt-3 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">{preview.teams.map((team, index) => <li key={`${team}-${index}`} className="border border-rift-line bg-rift-bg/40 px-2 py-1 text-[10px] text-rift-mutedbright">{team}</li>)}</ul>
          </details>
        </div>}
      </Modal>
      <Modal
        open={compactPromptOpen}
        title="Reality deleted"
        message="Compact the database now to reclaim disk space freed by this delete?"
        confirmLabel="Compact now"
        cancelLabel="Not now"
        onConfirm={() => void handleCompactAfterDelete()}
        onCancel={() => setCompactPromptOpen(false)}
      />
    </div>
  );
}
