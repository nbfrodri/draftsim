"use client";
import { useHydrated } from "@/lib/useHydrated";

import gsap from "gsap";
import { useEffect,useRef,useId,useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
  beforeConfirm?: () => Promise<void>;
  onCancel: () => void;
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export default function Modal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  beforeConfirm,
  onCancel,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const confirmingRef = useRef(false);
  const confirm = async () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setConfirming(true); setConfirmError(null);
    try { await beforeConfirm?.(); onConfirm(); }
    catch (error) { setConfirmError(error instanceof Error ? error.message : String(error)); }
    finally { confirmingRef.current = false; setConfirming(false); }
  };
  const titleId = useId();
  const messageId = useId();
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<Element | null>(null);
  const mounted = useHydrated();

  // Keep latest callbacks in refs so the open-animation effect doesn't depend
  // on their identities (parent may re-create them each render).
  const onCancelRef = useRef(onCancel);
  const onConfirmRef = useRef(onConfirm);
  useEffect(() => {
    onCancelRef.current = () => { if (!confirmingRef.current) { setConfirmError(null); onCancel(); } };
    onConfirmRef.current = onConfirm;
  });



  useEffect(() => {
    if (!open) return;

    // Remember who had focus so we can restore on close.
    lastFocusedRef.current = document.activeElement;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Entrance animation.
    gsap.fromTo(
      backdropRef.current,
      { opacity: 0 },
      { opacity: 1, duration: reducedMotion ? 0 : 0.25, ease: "power2.out" },
    );
    gsap.fromTo(
      panelRef.current,
      { opacity: 0, y: -24, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1, duration: reducedMotion ? 0 : 0.35, ease: "back.out(1.4)" },
    );

    // Move initial focus onto the confirm button.
    const focusTimer = window.setTimeout(() => {
      const cancel = panelRef.current?.querySelector<HTMLElement>("[data-modal-cancel]");
      (tone === "danger" ? cancel : confirmBtnRef.current)?.focus();
    }, 0);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancelRef.current();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        // Basic focus trap — cycle focus inside the panel.
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => !el.hasAttribute("aria-hidden"));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKey);
      // Restore focus to whatever had it before the modal opened.
      const prev = lastFocusedRef.current as HTMLElement | null;
      if (prev && typeof prev.focus === "function") {
        prev.focus();
      }
    };
  }, [open, tone]);

  if (!open || !mounted) return null;

  const confirmClasses =
    tone === "danger"
      ? "bg-gradient-to-b from-rift-red to-rift-reddeep text-white border-rift-red shadow-glow-red hover:brightness-110"
      : "btn-gold";

  const modal = (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[12000] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancelRef.current();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative w-full max-w-md bg-rift-panel/95 border border-rift-gold/60 shadow-[0_0_60px_rgba(0,0,0,0.8)] p-6 md:p-8"
      >
        <span className="absolute -top-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" />

        <div className="text-center mb-2 ornament">
          <span className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            Confirm
          </span>
        </div>
        <h2
          id={titleId}
          className="font-display text-xl md:text-2xl tracking-[0.15em] text-rift-goldbright text-center mb-3"
        >
          {title}
        </h2>
        <p id={messageId} className="max-h-[50vh] overflow-auto text-sm text-rift-mutedbright text-center mb-6 md:mb-8 leading-relaxed">
          {message}
        </p>

        {confirmError && <p role="alert" className="mb-3 text-sm text-red-300">{confirmError}</p>}
        {confirming && <p role="status" className="mb-3 text-sm text-rift-mutedbright">Saving a preventive copy...</p>}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            data-modal-cancel="true"
            disabled={confirming}
            onClick={() => onCancelRef.current()}
            className="py-3 border border-rift-line hover:border-rift-gold/60 text-rift-mutedbright hover:text-rift-goldbright font-display tracking-[0.3em] text-sm uppercase transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            disabled={confirming}
            onClick={() => void confirm()}
            className={`py-3 border font-display tracking-[0.3em] text-sm uppercase transition-all ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
