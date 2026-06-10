"use client";

import { useEffect, useState } from "react";

import { useDraftStore } from "@/store/draftStore";

// Compact pickers for the saved preset libraries, rendered inside the
// series/tournament setup forms. Clicking a chip applies the preset as
// the ACTIVE override (same path as the library "Use" buttons), so the
// series/tournament being configured will snapshot it on start. Renders
// nothing when the corresponding library is empty.

function useTransientApplied(): [string | null, (id: string) => void] {
  const [appliedId, setAppliedId] = useState<string | null>(null);
  useEffect(() => {
    if (!appliedId) return;
    const t = setTimeout(() => setAppliedId(null), 2500);
    return () => clearTimeout(t);
  }, [appliedId]);
  return [appliedId, setAppliedId];
}

function ChipList({
  label,
  items,
  appliedId,
  onPick,
}: {
  label: string;
  items: Array<{ id: string; name: string }>;
  appliedId: string | null;
  onPick: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="text-[8px] md:text-[9px] uppercase tracking-[0.35em] text-rift-muted mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const isApplied = appliedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item.id)}
              className={`px-2.5 py-1 border text-[9px] md:text-[10px] uppercase tracking-[0.2em] transition-all max-w-[180px] truncate ${
                isApplied
                  ? "border-rift-gold/80 bg-rift-gold/15 text-rift-goldbright"
                  : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5"
              }`}
              title={`Apply "${item.name}"`}
            >
              {isApplied ? `${item.name} ✓` : item.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Saved meta tier lists — applies the preset as the active meta. */
export function MetaPresetQuickPick() {
  const metaPresets = useDraftStore((s) => s.metaPresets);
  const applyMetaPreset = useDraftStore((s) => s.applyMetaPreset);
  const [appliedId, setAppliedId] = useTransientApplied();
  return (
    <ChipList
      label="Saved tier lists"
      items={metaPresets}
      appliedId={appliedId}
      onPick={(id) => {
        applyMetaPreset(id);
        setAppliedId(id);
      }}
    />
  );
}

/** Saved synergy & counter sets — applies as the active pairings. */
export function PairingsPresetQuickPick() {
  const pairingsPresets = useDraftStore((s) => s.pairingsPresets);
  const applyPairingsPreset = useDraftStore((s) => s.applyPairingsPreset);
  const [appliedId, setAppliedId] = useTransientApplied();
  return (
    <ChipList
      label="Saved synergy & counter sets"
      items={pairingsPresets}
      appliedId={appliedId}
      onPick={(id) => {
        applyPairingsPreset(id);
        setAppliedId(id);
      }}
    />
  );
}
