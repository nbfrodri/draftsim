"use client";
import { normalizeTeamStars } from "@/lib/teamStars";

/** Fixed five-glyph display, including a genuinely half-filled final star. */
export default function TeamStars({ rating, className = "" }: { rating: number; className?: string }) {
  const value = normalizeTeamStars(rating);
  return <span role="img" aria-label={`${value} out of 5 stars`} title={`${value} out of 5 stars`}
    className={`inline-flex shrink-0 whitespace-nowrap leading-none ${className}`}>
    {[0, 1, 2, 3, 4].map(index => <span key={index} aria-hidden="true" className="relative inline-block text-rift-gold/25">
      {"\u2605"}<span className="absolute inset-y-0 left-0 overflow-hidden text-rift-goldbright"
        style={{ width: `${Math.max(0, Math.min(1, value - index)) * 100}%` }}>{"\u2605"}</span>
    </span>)}
  </span>;
}

/** Native range semantics provide half-step keyboard, touch and pointer input. */
export function TeamStarPicker({ value, onChange, label = "Team rating" }: {
  value: number; onChange: (value: number) => void; label?: string;
}) {
  const rating = normalizeTeamStars(value);
  return <span className="inline-flex shrink-0 flex-col gap-1 text-[11px]">
    <span className="inline-flex items-center gap-1"><TeamStars rating={rating} /><span className="tabular-nums text-rift-mutedbright">{rating}</span></span>
    <input type="range" min={1} max={5} step={0.5} value={rating} aria-label={label}
      aria-valuetext={`${rating} out of 5 stars`} onChange={event => onChange(normalizeTeamStars(Number(event.target.value)))}
      className="h-2 w-20 cursor-pointer accent-rift-gold focus-visible:outline focus-visible:outline-rift-gold" />
  </span>;
}
