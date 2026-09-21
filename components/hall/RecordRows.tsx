"use client";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { Fragment, useState, type ReactNode } from "react";

const PAGE_SIZE = 20;
const pageButton = "inline-flex min-h-7 shrink-0 items-center justify-center gap-1 rounded-sm border border-rift-gold/30 bg-rift-gold/5 px-2 py-1.5 text-[9px] font-medium uppercase tracking-wider text-rift-goldbright transition-colors hover:border-rift-gold/70 hover:bg-rift-gold/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rift-gold disabled:cursor-not-allowed disabled:border-rift-line/50 disabled:bg-transparent disabled:text-rift-muted disabled:opacity-40 disabled:hover:border-rift-line/50 disabled:hover:bg-transparent";
/** Bound React/DOM work without discarding lower-ranked historical records. */
export default function RecordRows<T>({ items, children }: { items: readonly T[]; children: (item: T, index: number) => ReactNode }) {
  const [page, setPage] = useState(0);
  const last = Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1);
  const current = Math.min(page, last);
  const start = current * PAGE_SIZE;
  return <>
    {items.slice(start, start + PAGE_SIZE).map((item, index) => <Fragment key={start + index}>{children(item, start + index)}</Fragment>)}
    {items.length > PAGE_SIZE && <nav aria-label="Record pages" className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-rift-line bg-rift-bg px-3 py-2 text-[10px] text-rift-mutedbright">
      <button type="button" aria-label="Previous records" disabled={!current} onClick={() => setPage(current - 1)} className={pageButton}><IconChevronLeft size={12} aria-hidden="true" />Previous</button>
      <span aria-live="polite" className="min-w-0 flex-1 whitespace-nowrap text-center tabular-nums text-rift-mutedbright">{start + 1}-{Math.min(start + PAGE_SIZE, items.length)} of {items.length}</span>
      <button type="button" aria-label="Next records" disabled={current === last} onClick={() => setPage(current + 1)} className={pageButton}>Next<IconChevronRight size={12} aria-hidden="true" /></button>
    </nav>}
  </>;
}
