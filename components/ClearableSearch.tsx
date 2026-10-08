"use client";

import { useRef, type InputHTMLAttributes } from "react";
import { IconX } from "@tabler/icons-react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  clearLabel: string;
  containerClassName?: string;
};

/** Clears only the query and restores typing focus without dismissing a surface. */
export default function ClearableSearch({ value, onValueChange, clearLabel, containerClassName = "", className = "", ...inputProps }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return <div className={`relative min-w-0 ${containerClassName}`}>
    <input {...inputProps} ref={input} value={value} onChange={event => onValueChange(event.target.value)}
      className={`${className} w-full pr-9 [&::-webkit-search-cancel-button]:appearance-none`} />
    {value.length > 0 && <button type="button" aria-label={clearLabel} title={clearLabel} disabled={inputProps.disabled}
      onClick={() => { onValueChange(""); input.current?.focus(); }}
      className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-rift-mutedbright transition-colors hover:bg-rift-gold/10 hover:text-rift-goldbright focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold disabled:opacity-40">
      <IconX size={14} aria-hidden="true" />
    </button>}
  </div>;
}
