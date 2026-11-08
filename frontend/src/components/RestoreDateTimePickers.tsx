"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import s from "./RestoreDateTimePickers.module.css";
import { useAnchoredPopover } from "./useAnchoredPopover";

const months = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function parseYmd(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatYmd(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDisplayDate(value: string) {
  if (!value) return "";
  return parseYmd(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function usePopover(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useAnchoredPopover(open, ref);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
      const trigger = ref.current?.querySelector<HTMLElement>('button[aria-haspopup], input');
      if (trigger instanceof HTMLInputElement) trigger.dataset.popoverRestore = 'true';
      trigger?.focus();
      queueMicrotask(() => { if (trigger) delete trigger.dataset.popoverRestore; });
    }
    function navigate(event: KeyboardEvent) {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const group = target.closest('[data-keyboard-grid], [data-keyboard-column]');
      if (!group || !ref.current?.contains(group)) return;
      const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const index = buttons.indexOf(target);
      const columns = group.hasAttribute('data-keyboard-grid') ? 7 : 1;
      const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? columns : event.key === 'ArrowUp' ? -columns : 0;
      if (!offset) return;
      event.preventDefault();
      buttons[Math.max(0, Math.min(buttons.length - 1, index + offset))]?.focus();
    }
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("keydown", navigate);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("keydown", navigate);
    };
  }, [close, open]);

  return ref;
}

export function RestoreDatePicker({
  label,
  value,
  onChange,
  allowClear = true,
  variant = "field",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
  variant?: "field" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => value ? parseYmd(value) : new Date());
  const ref = usePopover(open, () => setOpen(false));
  const selected = value ? parseYmd(value) : null;
  const todayKey = formatYmd(new Date());
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const next = new Date(start);
    next.setDate(start.getDate() + index);
    return next;
  });
  const display = formatDisplayDate(value);

  function shiftMonth(step: -1 | 1) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + step, 1));
  }

  return (
    <div className={s.datePicker} ref={ref}>
      <button
        type="button"
        className={variant === "inline" ? s.datePicker__inlineTrigger : s.datePicker__trigger}
        aria-label={`${label}: ${display}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) setViewDate(value ? parseYmd(value) : new Date());
          setOpen((current) => !current);
        }}
      >
        <span>{display}</span>
        <CalendarDays />
      </button>
      {open && (
        <div className={`${s.datePicker__menu} ${s.datePicker__dateMenu}`} data-anchored-popover role="dialog" aria-label={label}>
          <header className={s.datePicker__dateHeader}>
            <button type="button" aria-label="Предыдущий месяц" onClick={() => shiftMonth(-1)}>
              <ChevronLeft />
            </button>
            <strong>{months[viewDate.getMonth()]} {viewDate.getFullYear()}</strong>
            <button type="button" aria-label="Следующий месяц" onClick={() => shiftMonth(1)}>
              <ChevronRight />
            </button>
          </header>
          <div className={s.datePicker__weekdays}>
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className={s.datePicker__dateGrid} data-keyboard-grid>
            {days.map((day) => {
              const key = formatYmd(day);
              const currentMonth = day.getMonth() === viewDate.getMonth();
              const selectedDay = selected ? key === formatYmd(selected) : false;
              return (
                <button
                  type="button"
                  key={key}
                  aria-label={day.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                  aria-pressed={selectedDay}
                  className={`${currentMonth ? "" : s.datePicker__outsideMonth} ${key === todayKey ? s.datePicker__today : ""} ${selectedDay ? s["datePicker__option--selected"] : ""}`}
                  onClick={() => {
                    onChange(key);
                    setViewDate(day);
                    setOpen(false);
                  }}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <footer className={s.datePicker__dateFooter}>
            {allowClear && <button type="button" onClick={() => { onChange(""); setOpen(false); }}>Очистить</button>}
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                onChange(formatYmd(today));
                setViewDate(today);
                setOpen(false);
              }}
            >
              Сегодня
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}

export function RestoreDateRangePicker({
  label,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}: {
  label: string;
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = usePopover(open, () => setOpen(false));

  return (
    <div className={`${s.datePicker} ${s.datePicker__range}`} ref={ref}>
      <button
        type="button"
        className={s.datePicker__rangeTrigger}
        aria-label={`${label}: ${formatDisplayDate(startValue)} — ${formatDisplayDate(endValue)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays aria-hidden="true" />
        <span>{label}</span>
        <strong>{formatDisplayDate(startValue)} — {formatDisplayDate(endValue)}</strong>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className={s.datePicker__rangeMenu} data-anchored-popover role="dialog" aria-label={label}>
          <label>
            <span>Начало</span>
            <RestoreDatePicker label="Начало периода" value={startValue} onChange={onStartChange} allowClear={false} />
          </label>
          <label>
            <span>Конец</span>
            <RestoreDatePicker label="Конец периода" value={endValue} onChange={onEndChange} allowClear={false} />
          </label>
          <button type="button" className={s.datePicker__rangeDone} onClick={() => setOpen(false)}>Готово</button>
        </div>
      )}
    </div>
  );
}

function normalizeTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function RestoreTimePicker({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const menuId = useId();
  const ref = usePopover(open, () => setOpen(false));
  const selectedHourRef = useRef<HTMLButtonElement>(null);
  const selectedMinuteRef = useRef<HTMLButtonElement>(null);
  const [hourValue, minuteValue] = (normalizeTime(value) ?? "10:00").split(":");
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")), []);
  const minutes = useMemo(() => ["00", "15", "30", "45"], []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      selectedHourRef.current?.scrollIntoView({ block: "center" });
      selectedMinuteRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [hourValue, minuteValue, open]);

  function commit(next: string) {
    onChange(next);
    setDraft(next);
  }

  return (
    <div className={s.datePicker} ref={ref}>
      <label className={`${s.datePicker__trigger} ${s.datePicker__timeInputWrap}`}>
        <input
          aria-label={label}
          role="combobox"
          aria-controls={menuId}
          aria-autocomplete="none"
          aria-haspopup="dialog"
          aria-expanded={open}
          required={required}
          inputMode="numeric"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => (event.key === 'ArrowDown' ? selectedHourRef : selectedMinuteRef).current?.focus());
          }}
          placeholder="--:--"
          value={open ? draft : value}
          onFocus={(event) => {
            if (event.currentTarget.dataset.popoverRestore === 'true') return;
            setDraft(value);
            setOpen(true);
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            const normalized = normalizeTime(event.target.value);
            if (normalized) onChange(normalized);
            if (!event.target.value && !required) onChange("");
          }}
          onBlur={() => {
            const normalized = normalizeTime(draft);
            setDraft(normalized ?? value);
          }}
        />
        <Clock />
      </label>
      {open && (
        <div className={`${s.datePicker__menu} ${s.datePicker__timeMenu}`} id={menuId} data-anchored-popover role="dialog" aria-label={label}>
          <div className={s.datePicker__timeGrid}>
            <div className={s.datePicker__timeColumn} data-keyboard-column>
              <span>Часы</span>
              {hours.map((hour) => (
                <button
                  type="button"
                  key={hour}
                  ref={hour === hourValue ? selectedHourRef : undefined}
                  className={hour === hourValue ? s["datePicker__option--selected"] : ""}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(`${hour}:${minuteValue}`)}
                >
                  {hour}
                </button>
              ))}
            </div>
            <div className={s.datePicker__timeColumn} data-keyboard-column>
              <span>Минуты</span>
              {minutes.map((minute) => (
                <button
                  type="button"
                  key={minute}
                  ref={minute === minuteValue ? selectedMinuteRef : undefined}
                  className={minute === minuteValue ? s["datePicker__option--selected"] : ""}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    commit(`${hourValue}:${minute}`);
                    setOpen(false);
                  }}
                >
                  {minute}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
