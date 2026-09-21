"use client";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { Fragment, useState, type ReactNode } from "react";

export const HALL_PAGE_SIZE = 20;
export const hallPageButton =
  "inline-flex min-h-7 shrink-0 items-center justify-center gap-1 rounded-sm border border-rift-gold/30 bg-rift-gold/5 px-2 py-1.5 text-[9px] font-medium uppercase tracking-wider text-rift-goldbright transition-colors hover:border-rift-gold/70 hover:bg-rift-gold/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rift-gold disabled:cursor-not-allowed disabled:border-rift-line/50 disabled:bg-transparent disabled:text-rift-muted disabled:opacity-40 disabled:hover:border-rift-line/50 disabled:hover:bg-transparent";

/** Shared Hall pagination chrome — same look as Records & Dynasties. */
export function HallPager({
  page,
  pageCount,
  total,
  pageSize,
  label = "pages",
  previousLabel = "Previous",
  nextLabel = "Next",
  /** Narrow columns (Search / Compare): chevron-only buttons, no cramped labels. */
  compact = false,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
  compact?: boolean;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const start = page * pageSize;
  const range = `${start + 1}–${Math.min(start + pageSize, total)} of ${total}`;
  return (
    <nav
      aria-label={label}
      className={`flex items-center border-t border-rift-line bg-rift-bg text-[10px] text-rift-mutedbright ${
        compact
          ? "justify-center gap-2 px-2 py-2"
          : "justify-between gap-2 px-3 py-2"
      }`}
    >
      <button
        type="button"
        aria-label={previousLabel}
        disabled={!page}
        onClick={() => onChange(page - 1)}
        className={hallPageButton}
      >
        <IconChevronLeft size={12} aria-hidden="true" />
        {!compact && <span>Previous</span>}
      </button>
      <span
        aria-live="polite"
        className={`tabular-nums text-rift-mutedbright ${
          compact
            ? "min-w-0 shrink text-center leading-tight"
            : "min-w-0 flex-1 whitespace-nowrap text-center"
        }`}
      >
        {range}
      </span>
      <button
        type="button"
        aria-label={nextLabel}
        disabled={page >= pageCount - 1}
        onClick={() => onChange(page + 1)}
        className={hallPageButton}
      >
        {!compact && <span>Next</span>}
        <IconChevronRight size={12} aria-hidden="true" />
      </button>
    </nav>
  );
}

/** Bound React/DOM work without discarding lower-ranked historical records. */
export default function RecordRows<T>({
  items,
  pageSize = HALL_PAGE_SIZE,
  label = "Record pages",
  children,
}: {
  items: readonly T[];
  pageSize?: number;
  label?: string;
  children: (item: T, index: number) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  const last = Math.max(0, Math.ceil(items.length / pageSize) - 1);
  const current = Math.min(page, last);
  const start = current * pageSize;
  return (
    <>
      {items.slice(start, start + pageSize).map((item, index) => (
        <Fragment key={start + index}>{children(item, start + index)}</Fragment>
      ))}
      <HallPager
        page={current}
        pageCount={last + 1}
        total={items.length}
        pageSize={pageSize}
        label={label}
        previousLabel="Previous records"
        nextLabel="Next records"
        onChange={setPage}
      />
    </>
  );
}
