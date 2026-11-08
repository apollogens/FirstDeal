"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import s from "./RestoreSelect.module.css";
import { useAnchoredPopover } from "./useAnchoredPopover";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
};

export function RestoreSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  required,
  showLabel = true,
  variant = "field",
}: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  required?: boolean;
  showLabel?: boolean;
  variant?: "field" | "filter";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.find((option) => option.value === value) ?? options[0];
  useAnchoredPopover(open, ref);

  function restoreFocus() {
    ref.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')?.focus();
  }

  useEffect(() => {
    if (!open) return;

    function closeOutside(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      restoreFocus();
    }

    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const index = Math.max(0, options.findIndex((option) => option.value === value));
    requestAnimationFrame(() => optionRefs.current[index]?.focus());
  }, [open, options, value]);

  function moveFocus(current: number, direction: number) {
    const next = (current + direction + options.length) % options.length;
    optionRefs.current[next]?.focus();
  }

  return (
    <div className={s.select} ref={ref}>
      <button
        type="button"
        className={`${s.select__trigger} ${variant === "filter" ? s["select__trigger--filter"] : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected?.label ?? ""}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {showLabel && <span>{label}</span>}
        <strong>{selected?.label ?? ""}</strong>
        <ChevronDown />
      </button>
      {open && (
        <div className={s.select__menu} data-anchored-popover role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <button
              ref={(node) => { optionRefs.current[index] = node; }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? s["select__option--selected"] : undefined}
              key={option.value || option.label}
              disabled={required && !option.value}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  moveFocus(index, event.key === "ArrowDown" ? 1 : -1);
                } else if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  optionRefs.current[event.key === "Home" ? 0 : options.length - 1]?.focus();
                } else if (event.key === "Escape") {
                  setOpen(false);
                  ref.current?.querySelector<HTMLButtonElement>(`button[aria-haspopup="listbox"]`)?.focus();
                }
              }}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                restoreFocus();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
