"use client";

import { useRef, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import { isDesktop, saveFileNative, openFileNative } from "@/lib/desktopStorage";

// Realities hub — the entry screen for franchise mode. A reality is a
// continuous, persistent timeline: the SAME teams + players carry from one
// season to the next (with an offseason transfer window + optional aging
// between years). Create a new reality, or resume / delete a saved one.

interface Props {
  onChoose: (view: "season-setup" | "menu") => void;
}

export default function RealitiesHub({ onChoose }: Props) {
  const realities = useDraftStore((s) => s.realities);
  const activeRealityId = useDraftStore((s) => s.activeRealityId);
  const beginNewReality = useDraftStore((s) => s.beginNewReality);
  const switchReality = useDraftStore((s) => s.switchReality);
  const deleteReality = useDraftStore((s) => s.deleteReality);
  const exportReality = useDraftStore((s) => s.exportReality);
  const importReality = useDraftStore((s) => s.importReality);

  const [name, setName] = useState("");
  const [aging, setAging] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const create = () => {
    beginNewReality(name || "My Reality", aging);
    onChoose("season-setup"); // configure the first season; startSeason promotes it
  };

  // Export one reality (its whole timeline + its own season history) to JSON —
  // native Save on desktop, browser download on web.
  const handleExport = async (id: string) => {
    const json = exportReality(id);
    if (!json) {
      flash("err", "Export failed");
      return;
    }
    const r = realities.find((x) => x.id === id);
    const safe = (r?.name ?? "reality").replace(/[/\\:*?"<>|]/g, "_").trim() || "reality";
    const filename = `${safe}.draftsim-reality.json`;
    if (isDesktop()) {
      const res = await saveFileNative({
        defaultPath: filename,
        filters: [{ name: "DraftSim Reality", extensions: ["json"] }],
        content: json,
      });
      if (res.ok) flash("ok", "Reality exported");
      else if (res.error !== "cancelled") flash("err", res.error ? `Export failed: ${res.error}` : "Export failed");
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    flash("ok", "Reality exported");
  };

  const applyImport = (text: string) => {
    const res = importReality(text);
    if (res.ok) flash("ok", "Reality imported");
    else flash("err", res.error ?? "Import failed");
  };

  const handleImport = async () => {
    if (isDesktop()) {
      const res = await openFileNative({
        filters: [{ name: "DraftSim Reality", extensions: ["json"] }],
      });
      if (!res.ok || res.content == null) {
        if (res.error && res.error !== "cancelled") flash("err", res.error);
        return;
      }
      applyImport(res.content);
      return;
    }
    fileInputRef.current?.click();
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;
    try {
      applyImport(await file.text());
    } catch {
      flash("err", "Could not read file");
    }
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

        {/* Create a new reality */}
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
              title="Each offseason: young players grow, veterans decline and retire, rookies arrive — driven by performance. Off = rosters change only via transfers."
            >
              <span
                className={`w-3.5 h-3.5 border flex items-center justify-center text-[9px] ${
                  aging ? "border-rift-gold/70 bg-rift-gold/15 text-rift-goldbright" : "border-rift-line text-transparent"
                }`}
              >
                ✓
              </span>
              Player aging, retirements &amp; rookies {aging ? "ON" : "OFF"}
            </button>
            <p className="text-[9px] text-rift-muted/55">
              Next you&apos;ll configure the first season (leagues, formats, real names).
            </p>
          </div>
        </div>

        {/* Saved realities */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/55">
            Saved realities {realities.length > 0 ? `(${realities.length})` : ""}
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
          <button
            type="button"
            onClick={handleImport}
            title="Import a reality exported from DraftSim (its timeline + that reality's season history)"
            className="ml-auto text-[9px] uppercase tracking-[0.3em] text-rift-gold/80 hover:text-rift-goldbright transition-colors"
          >
            Import (.json)
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={onFilePicked}
        />
        {realities.length === 0 ? (
          <div className="text-[11px] italic text-rift-muted/60">
            No realities yet — create one above.
          </div>
        ) : (
          <div className="space-y-1.5">
            {realities.map((r) => {
              const active = r.id === activeRealityId;
              const complete = r.season?.status === "complete";
              return (
                <div
                  key={r.id}
                  className={`flex items-center gap-2 px-3 py-2 border ${
                    active ? "border-rift-blue/50 bg-rift-blue/[0.06]" : "border-rift-line/40 bg-rift-bg/30"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-rift-mutedbright truncate">{r.name}</div>
                    <div className="text-[9px] uppercase tracking-[0.2em] text-rift-muted/55">
                      Year {r.year} · {complete ? "offseason ready" : "in progress"}
                      {active ? " · active" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => switchReality(r.id)}
                    className="px-3 py-1 border border-rift-gold/60 bg-rift-gold/10 text-rift-goldbright text-[9px] uppercase tracking-[0.2em] hover:bg-rift-gold/20 transition-all"
                  >
                    {active ? "Resume" : "Open"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport(r.id)}
                    title="Export this reality (timeline + its season history) to a file"
                    className="px-2 py-1 border border-rift-line text-rift-mutedbright text-[9px] uppercase tracking-[0.2em] hover:border-rift-gold/50 hover:text-rift-goldbright transition-all"
                  >
                    Export
                  </button>
                  {confirmDelete === r.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        deleteReality(r.id);
                        setConfirmDelete(null);
                      }}
                      className="px-2 py-1 border border-rift-red/60 text-rift-redbright text-[9px] uppercase tracking-[0.2em]"
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(r.id)}
                      className="px-2 py-1 border border-rift-line text-rift-muted text-[9px] uppercase tracking-[0.2em] hover:border-rift-red/50 hover:text-rift-redbright transition-all"
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
