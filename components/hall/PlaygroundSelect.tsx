"use client";

import { useEffect, useId, useRef, useState } from "react";

/** Compact Hall picker with a themed popup and native-style keyboard controls. */
export default function PlaygroundSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const show = () => {
    const rect = root.current?.getBoundingClientRect();
    setAbove(
      !!rect &&
        window.innerHeight - rect.bottom < 240 &&
        rect.top > window.innerHeight - rect.bottom,
    );
    setActive(selected);
    setOpen(true);
  };
  const choose = (index: number) => {
    if (options[index]) onChange(options[index].value);
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open)
      list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  return (
    <div
      ref={root}
      className="relative grid min-w-32 gap-1.5"
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id} className="text-[10px] text-rift-mutedbright">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        className={`flex min-h-8 items-center justify-between gap-4 border bg-rift-bg px-2.5 py-1.5 text-left text-[11px] text-rift-goldbright focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold ${open ? "border-rift-gold/70" : "border-rift-line/60 hover:border-rift-gold/40"}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            return;
          }
          if (event.key === "Tab") {
            setOpen(false);
            return;
          }
          if (
            ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(
              event.key,
            )
          ) {
            event.preventDefault();
            if (!open) {
              show();
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              choose(active);
              return;
            }
            setActive((current) =>
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        options.length - 1,
                        current + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
            );
          } else if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey
          ) {
            const match = options.findIndex((option) =>
              option.label.toLowerCase().startsWith(event.key.toLowerCase()),
            );
            if (match >= 0) {
              event.preventDefault();
              if (!open) show();
              setActive(match);
            }
          }
        }}
      >
        <span>{options[selected]?.label}</span>
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={`h-3 w-3 text-rift-gold/70 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
        >
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className={`absolute left-0 z-30 max-h-60 min-w-full overflow-y-auto border border-rift-gold/50 bg-rift-panel py-1 shadow-xl ${above ? "bottom-10" : "top-full mt-1"}`}
          onMouseDown={(event) => event.preventDefault()}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={`flex cursor-pointer items-center justify-between gap-4 whitespace-nowrap border-l-2 px-3 py-2 text-[11px] ${active === index ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright" : "border-transparent text-rift-mutedbright"}`}
            >
              <span>{option.label}</span>
              <span aria-hidden className="w-3 text-rift-gold">
                {option.value === value ? "✓" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
