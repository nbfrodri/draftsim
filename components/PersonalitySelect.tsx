"use client";

/**
 * PersonalitySelect — shared AI draft-personality picker.
 *
 * Two display modes controlled by the `variant` prop:
 *
 *   "chip"  — compact popover trigger for tight spaces (TournamentSetup team rows).
 *             Shows a small button with an abbreviated label; clicking opens a
 *             vertically-scrollable popover listing every option with its
 *             description. Follows the same popover pattern used by TeamIconPicker
 *             and TeamColorPicker: a fixed-inset backdrop button captures outside
 *             clicks and Escape closes the menu.
 *
 *   "panel" — full card-grid for spacious contexts (CreateSimulationForm). Renders
 *             each option as a selectable card with name + one-line description.
 *             Wrapped in a side-colored container matching SideDifficultyRow.
 *
 * The "Random" sentinel value (undefined / RANDOM_PERSONALITY_VALUE) is always
 * the first option. When selected, the chip shows "?" and the card shows "Random"
 * with a short description.
 *
 * Accessibility:
 *   - All interactive elements are real <button>s.
 *   - Popover closes on Escape and outside click.
 *   - aria-expanded on the trigger; role="listbox" on the popover with
 *     aria-selected on each option.
 *   - Focus is not forcibly trapped (the popover is small and inline),
 *     but Tab/Shift-Tab move through the items naturally.
 */

import { useEffect, useRef, useState } from "react";
import { PERSONALITY_LIST } from "@/lib/draftAI";
import type { DraftPersonality } from "@/lib/draftAI";

// Sentinel used by CreateSimulationForm for the "pick on start" option.
export const RANDOM_PERSONALITY_VALUE = "__random__";

// Abbreviated display name for the compact chip trigger.
function abbrev(p: DraftPersonality): string {
  // Take first word, max 6 chars.
  const first = p.name.split(" ")[0];
  return first.length > 6 ? first.slice(0, 5) + "…" : first;
}

// ─── Compact chip + popover (used in TournamentSetup team rows) ───────────────

interface ChipProps {
  /** Current personality id, or undefined for "Random". */
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}

export function PersonalityChipSelect({ value, onChange }: ChipProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const selected = PERSONALITY_LIST.find((p) => p.id === value);
  const isSet = value != null;

  // Label shown on the trigger button.
  const triggerLabel = selected ? abbrev(selected) : "?";

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={
          selected
            ? `Personality: ${selected.name} — ${selected.description}`
            : "AI drafting personality (Random by default)"
        }
        className={`inline-flex items-center gap-0.5 px-1.5 py-1 border text-[9px] uppercase tracking-[0.15em] font-display transition-all shrink-0 ${
          isSet
            ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
            : "border-rift-line text-rift-mutedbright/80 hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5"
        }`}
      >
        {/* Small dice-ish icon — inline SVG, no external dep */}
        <svg
          viewBox="0 0 12 12"
          className="w-2.5 h-2.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          aria-hidden
        >
          <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" />
          <circle cx="4" cy="4" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="8" cy="4" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="6" cy="6" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="4" cy="8" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="8" cy="8" r="0.75" fill="currentColor" stroke="none" />
        </svg>
        <span>{triggerLabel}</span>
      </button>

      {open && (
        <>
          {/* Backdrop — captures outside clicks */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close personality picker"
            className="fixed inset-0 z-10 cursor-default"
            tabIndex={-1}
          />

          {/* Popover */}
          <div
            role="listbox"
            aria-label="AI Personality"
            className="absolute z-20 right-0 mt-1 w-52 bg-rift-panel border border-rift-gold/50 shadow-lg py-0.5 max-h-72 overflow-y-auto"
          >
            {/* Random option */}
            <button
              type="button"
              role="option"
              aria-selected={!isSet}
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className={`w-full text-left px-2.5 py-1.5 transition-colors ${
                !isSet
                  ? "bg-rift-gold/10 text-rift-goldbright"
                  : "text-rift-mutedbright hover:bg-rift-gold/5 hover:text-rift-goldbright"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] uppercase tracking-[0.2em] font-display">
                  Random
                </span>
                {!isSet && (
                  <span className="text-rift-gold text-[8px]">&#10003;</span>
                )}
              </div>
              <div className="text-[8px] text-rift-muted leading-snug mt-0.5">
                Assigned at tournament start
              </div>
            </button>

            {/* Divider */}
            <div className="my-0.5 border-t border-rift-line/60" />

            {/* Personality options */}
            {PERSONALITY_LIST.map((p) => {
              const active = value === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 transition-colors ${
                    active
                      ? "bg-rift-gold/10 text-rift-goldbright"
                      : "text-rift-mutedbright hover:bg-rift-gold/5 hover:text-rift-goldbright"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] uppercase tracking-[0.2em] font-display">
                      {p.name}
                    </span>
                    {active && (
                      <span className="text-rift-gold text-[8px]">&#10003;</span>
                    )}
                  </div>
                  <div className="text-[8px] text-rift-muted leading-snug mt-0.5">
                    {p.description}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Full panel / card-grid (used in CreateSimulationForm) ────────────────────

interface PanelProps {
  /** Sidebar label ("Blue AI" / "Red AI" / "AI"). */
  label: string;
  /** "blue" | "red" — drives accent color. */
  side: "blue" | "red";
  /**
   * Current value: a personality id, or RANDOM_PERSONALITY_VALUE for "Random".
   * (CreateSimulationForm uses the string sentinel, not undefined.)
   */
  value: string;
  onChange: (v: string) => void;
}

export function PersonalityPanelSelect({ label, side, value, onChange }: PanelProps) {
  const containerCls =
    side === "blue"
      ? "border border-rift-blue/30 bg-rift-blue/[0.04] p-2"
      : "border border-rift-red/30 bg-rift-red/[0.04] p-2";
  const labelCls =
    side === "blue"
      ? "text-[9px] uppercase tracking-[0.3em] mb-2 text-rift-bluebright"
      : "text-[9px] uppercase tracking-[0.3em] mb-2 text-rift-redbright";

  // All options: Random sentinel + personalities.
  const allOptions: Array<{ id: string; name: string; description: string }> = [
    {
      id: RANDOM_PERSONALITY_VALUE,
      name: "Random",
      description: "A personality is chosen at random when the draft starts.",
    },
    ...PERSONALITY_LIST,
  ];

  return (
    <div className={containerCls}>
      <div className={labelCls}>{label}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {allOptions.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              className={`text-left px-2 py-1.5 border transition-all ${
                active
                  ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                  : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright hover:bg-rift-gold/5"
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[9px] uppercase tracking-[0.2em] font-display leading-tight">
                  {opt.name}
                </span>
                {active && (
                  <span className="text-rift-gold text-[8px] shrink-0">
                    &#10003;
                  </span>
                )}
              </div>
              <div className="text-[7px] text-rift-muted leading-snug">
                {opt.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
