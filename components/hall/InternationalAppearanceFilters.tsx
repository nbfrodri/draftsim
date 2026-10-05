"use client";

import LeagueIcon from "@/components/LeagueIcon";
import { INTERNATIONAL_DISPLAY_ORDER, INTERNATIONAL_LABELS } from "@/lib/season/types";
import type { IntlAppearanceFilters } from "@/lib/season/historySearch";

const chip = "border px-1.5 py-0.5 text-[8px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";
const active = "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright";
const inactive = "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40";

export default function InternationalAppearanceFilters({ value, onChange }: {
  value: IntlAppearanceFilters;
  onChange: (value: IntlAppearanceFilters) => void;
}) {
  return <div className="mb-3 space-y-1.5" role="group" aria-label="International appearance filters">
    <div className="text-[8px] uppercase tracking-[0.25em] text-rift-gold/50">Appearance filters</div>
    <button type="button" aria-pressed={value.enabled} onClick={() => onChange({ ...value, enabled: !value.enabled })}
      className={`${chip} uppercase tracking-[0.15em] ${value.enabled ? active : inactive}`}>
      Intl appearances
    </button>
    {value.enabled && <>
      <div className="flex flex-wrap gap-1">
        {([{ id: "any", label: "Match any (OR)" }, { id: "all", label: "Match all (AND)" }] as const).map(mode =>
          <button key={mode.id} type="button" aria-pressed={value.match === mode.id}
            onClick={() => onChange({ ...value, match: mode.id })} className={`${chip} ${value.match === mode.id ? active : inactive}`}>
            {mode.label}
          </button>)}
      </div>
      <div className="flex flex-wrap gap-1">
        {INTERNATIONAL_DISPLAY_ORDER.map(event => <button key={event} type="button" aria-label={INTERNATIONAL_LABELS[event]} aria-pressed={value.events.includes(event)}
          onClick={() => onChange({ ...value, events: value.events.includes(event)
            ? value.events.filter(selected => selected !== event) : [...value.events, event] })}
          className={`${chip} inline-flex items-center gap-1 ${value.events.includes(event) ? active : inactive}`}>
          <LeagueIcon league={event} size={11} />{INTERNATIONAL_LABELS[event]}
        </button>)}
      </div>
      <label className="flex items-center gap-2 text-[8px] text-rift-mutedbright">
        Min appearances
        <input type="number" min={1} step={1} inputMode="numeric" value={value.minimum}
          onChange={event => onChange({ ...value, minimum: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
          className="w-14 border border-rift-line/60 bg-rift-bg/40 px-2 py-1 text-[10px] focus:border-rift-gold/50 focus:outline-none" />
      </label>
      <p className="text-[8px] leading-relaxed text-rift-mutedbright/70">
        {value.events.length === 0 ? "No events selected: includes all internationals. " : ""}
        {value.match === "all" ? "Requires participation in every selected event. " : "Requires participation in any selected event. "}
        Minimum counts selected events combined. Play-ins count; did not qualify does not.
      </p>
    </>}
  </div>;
}
