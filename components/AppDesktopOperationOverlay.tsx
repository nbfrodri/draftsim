"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { IconCheck } from "@tabler/icons-react";
import type { DesktopOperationPhase } from "@/lib/desktopStorage";
import { OPERATIONS, estimatedRemainingMs, formatElapsed, getOperationProgress, getServerOperationProgress, subscribeOperationProgress } from "@/lib/operationProgress";

/** A shared native modal keeps mouse and keyboard on the operation until it finishes. */
export default function AppDesktopOperationOverlay(_props: { phase: Exclude<DesktopOperationPhase, "idle"> }) {
  const operation = useSyncExternalStore(subscribeOperationProgress, getOperationProgress, getServerOperationProgress);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [now, setNow] = useState(() => Date.now());
  const id = operation?.id;
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    node?.showModal(); node?.focus();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); node?.close(); if (previous?.isConnected) previous.focus(); };
  }, [id]);
  if (!operation) return null;
  const definition = OPERATIONS[operation.kind];
  const index = operation.index, total = definition.steps.length;
  const time = Math.max(now, operation.stepStartedAt);
  const remaining = estimatedRemainingMs(operation, time);
  return createPortal(
    <dialog ref={dialog} tabIndex={-1} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => event.preventDefault()}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape" || event.key === "Tab") event.preventDefault();
      }}
      className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none overflow-y-auto bg-rift-bg/95 p-4 text-rift-mutedbright outline-none backdrop:bg-black/70 sm:p-6">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-xl border border-rift-gold/30 bg-rift-panel px-5 py-6 shadow-[0_0_70px_rgba(0,0,0,0.45)] sm:p-8">
          <p className="mb-4 text-[9px] uppercase tracking-[0.25em] text-rift-gold">DraftSim / Saved data</p>
          <h2 id={titleId} className="font-display text-2xl tracking-[0.08em] text-rift-goldbright">{definition.title}</h2>
          <p id={descriptionId} className="mt-2 text-sm leading-relaxed">{definition.description}</p>
          <dl className="my-5 grid grid-cols-2 divide-x divide-rift-gold/20 border-y border-rift-gold/20 py-3">
            <div><dt className="text-[9px] uppercase tracking-[0.15em] text-rift-mutedbright">Elapsed</dt><dd className="mt-1 font-display text-xl tabular-nums text-rift-goldbright">{formatElapsed(time - operation.startedAt)}</dd></div>
            <div className="pl-4"><dt className="text-[9px] uppercase tracking-[0.15em] text-rift-mutedbright">Estimated remaining</dt><dd className="mt-1 text-sm tabular-nums text-rift-goldbright">{remaining === null ? operation.previous ? "Taking longer than last time" : "Estimating..." : `About ${formatElapsed(Math.ceil(remaining / 5000) * 5000)}`}</dd></div>
          </dl>
          <div className="mb-2 flex justify-between gap-3 text-[10px] text-rift-mutedbright"><span>Step {index + 1} of {total}</span><span>{total - index - 1} steps after this</span></div>
          <progress aria-label="Completed steps" max={total} value={index} className="mb-4 block h-1 w-full accent-rift-gold" />
          <ol className="space-y-1" aria-label="Operation steps">
            {definition.steps.map(([key, title, detail], stepIndex) => {
              const active = stepIndex === index, complete = stepIndex < index;
              return <li key={key} aria-current={active ? "step" : undefined} className={`flex gap-3 border px-3 py-2 ${active ? "border-rift-gold/40 bg-rift-gold/[0.06]" : "border-transparent"}`}>
                <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-[10px] tabular-nums ${complete ? "text-rift-bluebright" : "text-rift-gold"}`}>{complete ? <IconCheck size={15} /> : stepIndex + 1}</span>
                <div><p className={`text-sm ${active ? "text-rift-goldbright" : "text-rift-mutedbright"}`}>{title}</p>{active && <p className="mt-1 text-xs leading-relaxed text-rift-mutedbright">{detail}</p>}</div>
              </li>;
            })}
          </ol>
          <div role="status" className="mt-5 flex items-center gap-3 text-xs text-rift-goldbright"><span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-rift-gold/25 border-t-rift-goldbright motion-reduce:animate-none" />{definition.steps[index][1]}...</div>
          <p className="mt-4 border-t border-rift-line pt-3 text-xs leading-relaxed text-rift-mutedbright">Keep DraftSim open. {operation.previous ? "Time estimates are based on the last completed run and may vary with save size and drive speed." : "A time estimate will be available after a completed run. The steps above show what is left."}</p>
        </div>
      </div>
    </dialog>, document.body,
  );
}
