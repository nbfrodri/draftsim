"use client";

import LeagueIcon from "@/components/LeagueIcon";
import SplitIcon from "@/components/season/SplitIcon";
import { INTERNATIONAL_LABELS, SPLIT_LABELS, type InternationalId, type SplitId } from "@/lib/season/types";

export type CareerEvent = SplitId | InternationalId;
const EVENTS: readonly { key: CareerEvent; kind: "split" | "international"; label: string }[] = [
  { key: "winter", kind: "split", label: "Winter" },
  { key: "first-stand", kind: "international", label: "First Stand" },
  { key: "spring", kind: "split", label: "Spring" },
  { key: "msi", kind: "international", label: "MSI" },
  { key: "summer", kind: "split", label: "Summer" },
  { key: "worlds", kind: "international", label: "Worlds" },
  { key: "global-cup", kind: "international", label: "Global Cup" },
];
const control = "border border-rift-line/60 bg-rift-bgdeep px-2 py-1.5 text-[10px] text-rift-mutedbright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rift-gold";

export default function CareerHistoryControls({ seasons, from, to, onFrom, onTo, onAllSeasons, selected, onToggle, onClear, matches, visibleSeasons }: {
  seasons: { id: string; label: string }[];
  from: string;
  to: string;
  onFrom: (id: string) => void;
  onTo: (id: string) => void;
  onAllSeasons: () => void;
  selected: ReadonlySet<CareerEvent>;
  onToggle: (event: CareerEvent) => void;
  onClear: () => void;
  matches: number;
  visibleSeasons: number;
}) {
  return <div className="mb-3 space-y-3 border border-rift-line/40 bg-rift-bg/30 p-3">
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Career history season range">
      {([{ label: "From season", value: from, change: onFrom, empty: "First season" },
        { label: "To season", value: to, change: onTo, empty: "Latest season" }] as const).map(field =>
        <label key={field.label} className="flex min-w-0 flex-1 basis-36 flex-col gap-1 text-[10px] text-rift-mutedbright">
          {field.label}
          <select aria-label={field.label} className={`${control} w-full min-w-0`} value={field.value} onChange={event => field.change(event.target.value)} disabled={!seasons.length}>
            <option value="">{field.empty}</option>
            {seasons.map(season => <option key={season.id} value={season.id}>{season.label}</option>)}
          </select>
        </label>)}
      <button type="button" className={`${control} hover:border-rift-gold/60 disabled:opacity-40`} disabled={!from && !to} onClick={onAllSeasons}>All seasons</button>
    </div>
    <div role="group" aria-label="Highlight career events">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-[0.2em] text-rift-gold/70">Highlight events</span>
        <button type="button" onClick={onClear} disabled={!selected.size}
          className="text-[10px] text-rift-mutedbright underline decoration-rift-line underline-offset-4 hover:text-rift-goldbright disabled:opacity-40 focus-visible:outline focus-visible:outline-rift-gold">Clear highlights</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EVENTS.map(event => <button key={event.key} type="button" aria-pressed={selected.has(event.key)}
          aria-label={event.kind === "split" ? SPLIT_LABELS[event.key as SplitId] : INTERNATIONAL_LABELS[event.key as InternationalId]}
          onClick={() => onToggle(event.key)}
          className={`inline-flex items-center gap-1.5 border px-2 py-1.5 text-[10px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rift-gold ${selected.has(event.key)
            ? "border-rift-gold/75 bg-rift-gold/10 text-rift-goldbright shadow-[0_0_10px_rgba(200,170,110,0.15)]"
            : "border-rift-line/60 text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright"}`}>
          <span aria-hidden className="inline-flex shrink-0">{event.kind === "split"
            ? <SplitIcon split={event.key as SplitId} size={14} className="shrink-0 text-current" />
            : <LeagueIcon league={event.key as InternationalId} size={14} />}</span>
          {event.label}
        </button>)}
      </div>
    </div>
    <p role="status" className="text-[10px] leading-relaxed text-rift-mutedbright/80">
      {selected.size ? `${matches} highlighted ${matches === 1 ? "event" : "events"} in ${visibleSeasons} ${visibleSeasons === 1 ? "season" : "seasons"}. Other events stay visible.`
        : "Choose one or more events to highlight across the seasons shown."}
    </p>
  </div>;
}
