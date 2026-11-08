"use client";

import { validCalendarSlots } from "@/lib/portfolio-presentation";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BrainCircuit,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Ellipsis,
  FileText,
  Mail,
  MapPin,
  Menu,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  CalendarApiError,
  CalendarEvent,
  CalendarEventPayload,
  CalendarScope,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  updateCalendarEvent,
} from "@/lib/calendar";
import { calendarEventViewModel } from "@/features/calendar-v2/adapters/calendarEventViewModel";
import {
  readCalendarOverlay,
  setEventImportance,
  writeCalendarOverlay,
  type CalendarOverlay,
} from "@/features/calendar-v2/adapters/calendarLocalOverlay";
import type { CalendarEventViewModel } from "@/features/calendar-v2/types";
import {
  clipEventsToVisibleRange,
  layoutOverlappingEvents,
  visibleCapacityForWidth,
  type CalendarEventCluster,
} from "@/features/calendar-v2/utils/layoutOverlappingEvents";
import { RestoreDatePicker, RestoreTimePicker } from "./RestoreDateTimePickers";
import { RestoreSelect, type SelectOption } from "./RestoreSelect";
import { GoogleCalendarConnections } from "./GoogleCalendarConnections";
import s from "./Calendar.module.css";

type ViewMode = "day" | "week" | "month";

const subscribeMobileCalendar = (callback: () => void) => {
  const media = window.matchMedia("(max-width: 640px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const getMobileCalendarSnapshot = () => window.matchMedia("(max-width: 640px)").matches;
type ScopeFilter = CalendarScope | "";

const MSK_OFFSET = "+03:00";
const DAY_START = 9;
const DAY_END = 24;
const MIN_EVENT_MINUTES = 30;
const RESIZE_STEP_MINUTES = 15;
const initialAnchor = new Date();
const eventScopeOptions: SelectOption<CalendarScope>[] = [
  { value: "personal", label: "Личное" },
  { value: "work", label: "Рабочее" },
];
const reminderOptions: SelectOption<string>[] = [
  { value: "5", label: "За 5 минут" },
  { value: "15", label: "За 15 минут" },
  { value: "30", label: "За 30 минут" },
  { value: "60", label: "За 1 час" },
  { value: "1440", label: "За день" },
];
const monthNames = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

type AgentSuggestion = {
  startsAt: string;
  endsAt: string;
  endDateLabel: string;
  id: string;
  title: string;
  date: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  scope: CalendarScope;
  source: "agent";
  reason: string;
  status: "pending";
};

function suggestionEvent(item: AgentSuggestion): CalendarEvent {
  const startsAt = item.startsAt;
  const endsAt = item.endsAt;
  const createdAt = new Date().toISOString();
  return {
    id: `agent-suggestion-${item.id}`,
    user_id: "agent",
    title: item.title,
    description: item.reason,
    scope: item.scope,
    starts_at: startsAt,
    ends_at: endsAt,
    location: null,
    remind_at: reminderDate(startsAt, 30),
    reminder_sent_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function isAgentEvent(event: CalendarEvent) {
  return event.id.startsWith("agent-suggestion-");
}

function dateAt(date: Date, hour = 0, minute = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekStart(date: Date) {
  const next = dateAt(date);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  return next;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseEventDate(value: string) {
  return new Date(value);
}

function timePart(value: string) {
  return parseEventDate(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fullDate(value: string | Date) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).replace(/\s?г\.$/, "");
}

function monthLabel(date: Date) {
  const month = date.toLocaleDateString("ru-RU", { month: "long" })
    .replace(/^./, (char) => char.toUpperCase());
  return `${month} ${date.getFullYear()}`;
}

function periodLabel(start: Date, end: Date) {
  const left = start.toLocaleDateString("ru-RU", { day: "numeric" });
  const right = fullDate(end);
  return `${left} - ${right} · МСК`;
}

function eventScope(event: CalendarEvent): CalendarScope {
  return event.scope ?? "personal";
}

function scopeLabel(scope: CalendarScope) {
  return scope === "work" ? "Рабочее" : "Личное";
}

function reminderLabel(event: CalendarEvent) {
  const start = parseEventDate(event.starts_at).getTime();
  const remind = parseEventDate(event.remind_at).getTime();
  const minutes = Math.max(0, Math.round((start - remind) / 60000));
  if (minutes === 5) return "За 5 минут";
  if (minutes === 15) return "За 15 минут";
  if (minutes === 60) return "За 1 час";
  if (minutes === 1440) return "За день";
  return "За 30 минут";
}

function rangeFor(anchor: Date, view: ViewMode) {
  if (view === "day") return { start: dateAt(anchor), end: dateAt(anchor, 23, 59) };
  if (view === "month") {
    const start = monthStart(anchor);
    return { start, end: dateAt(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0), 23, 59) };
  }
  const start = weekStart(anchor);
  return { start, end: dateAt(addDays(start, 6), 23, 59) };
}

function localDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00${MSK_OFFSET}`).toISOString();
}

function reminderDate(startsAt: string, minutes: number) {
  return new Date(new Date(startsAt).getTime() - minutes * 60000).toISOString();
}

function reminderOffsetMinutes(event: CalendarEvent) {
  const start = parseEventDate(event.starts_at).getTime();
  const remind = parseEventDate(event.remind_at).getTime();
  return Math.max(0, Math.round((start - remind) / 60000)) || 30;
}

export function CalendarScreen({ onMenu }: { onMenu: () => void }) {
  const [anchor, setAnchor] = useState(initialAnchor);
  const isMobileCalendar = useSyncExternalStore(subscribeMobileCalendar, getMobileCalendarSnapshot, () => false);
  const [requestedView, setRequestedView] = useState<ViewMode | null>(null);
  const view = requestedView ?? (isMobileCalendar ? "day" : "week");
  const [scope, setScope] = useState<ScopeFilter>("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [suggestedEvents, setSuggestedEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [dynamicSuggestions, setDynamicSuggestions] = useState<AgentSuggestion[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [modal, setModal] = useState<CalendarEvent | "new" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState(initialAnchor.getFullYear());
  const [toast, setToast] = useState("");
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [overlay, setOverlay] = useState<CalendarOverlay>({});
  const monthPickerRef = useRef<HTMLDivElement>(null);
  const range = useMemo(() => rangeFor(anchor, view), [anchor, view]);
  const limit = 50;

  const load = useCallback(async (nextOffset = 0, signal?: AbortSignal) => {
    setError("");
    if (nextOffset === 0) setLoading(true);
    try {
      const data = await getCalendarEvents({
        date_from: range.start.toISOString(),
        date_to: range.end.toISOString(),
        scope: scope || undefined,
        limit,
        offset: nextOffset,
      }, signal);
      setEvents((prev) => nextOffset === 0 ? data : [...prev, ...data]);
      setHasMore(data.length === limit);
      setOffset(nextOffset);
    } catch (event) {
      if (signal?.aborted) return;
      setError(event instanceof Error ? event.message : "Не удалось загрузить события");
      setEvents([]);
      setHasMore(false);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [range.end, range.start, scope]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(0, controller.signal));
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    queueMicrotask(() => setOverlay(readCalendarOverlay()));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!monthPickerOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!monthPickerRef.current?.contains(event.target as Node)) setMonthPickerOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMonthPickerOpen(false);
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeEscape);
    };
  }, [monthPickerOpen]);

  const displayEvents = useMemo(() => {
    const source = [...events, ...suggestedEvents];
    return source.filter((event) => {
      const starts = parseEventDate(event.starts_at);
      if (starts < range.start || starts > range.end) return false;
      return !scope || eventScope(event) === scope;
    });
  }, [events, range.end, range.start, scope, suggestedEvents]);

  useEffect(() => {
    let cancelled = false;
    async function loadFreeSlots() {
      setDynamicSuggestions([]);
      try {
        const fromIso = range.start.toISOString();
        const toIso = range.end.toISOString();
        const res = await fetch(
          `/api/calendar/free-slots?date_from=${encodeURIComponent(fromIso)}&date_to=${encodeURIComponent(toIso)}&min_duration_minutes=30`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const slots: unknown = await res.json();
        if (cancelled || !Array.isArray(slots)) return;
        const suggestions: AgentSuggestion[] = validCalendarSlots(slots, range.start, range.end).slice(0, 3).map((slot, index) => {
          const sDate = new Date(slot.starts_at);
          const eDate = new Date(slot.ends_at);
          const dKey = dateKey(sDate);
          const dLabel = sDate.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
          const startTime = `${String(sDate.getHours()).padStart(2, "0")}:${String(sDate.getMinutes()).padStart(2, "0")}`;
          const endTime = `${String(eDate.getHours()).padStart(2, "0")}:${String(eDate.getMinutes()).padStart(2, "0")}`;
          return {
            startsAt: slot.starts_at,
            endsAt: slot.ends_at,
            endDateLabel: dateKey(sDate) === dateKey(eDate) ? "" : eDate.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
            id: `slot-${index}-${dKey}`,
            title: "Свободное окно для встречи",
            date: dKey,
            dateLabel: dLabel,
            startTime,
            endTime,
            scope: "work",
            source: "agent" as const,
            reason: `Свободный слот (${slot.duration_minutes} мин) в вашем календаре`,
            status: "pending" as const,
          };
        });
        setDynamicSuggestions(suggestions);
      } catch {
        // ignore
      }
    }
    void loadFreeSlots();
    return () => {
      cancelled = true;
    };
  }, [range.end, range.start]);

  const viewEvents = useMemo(
    () => displayEvents.map((event) => calendarEventViewModel(event, overlay)),
    [displayEvents, overlay],
  );

  const setImportant = useCallback((eventId: string, important: boolean) => {
    setOverlay((current) => {
      const next = setEventImportance(current, eventId, important);
      writeCalendarOverlay(next);
      return next;
    });
  }, []);

  const addedSuggestionIds = useMemo(
    () => new Set(suggestedEvents.map((event) => event.id.replace("agent-suggestion-", ""))),
    [suggestedEvents],
  );

  const selected = selectedId === ""
    ? null
    : displayEvents.find((event) => event.id === selectedId) ?? displayEvents[0] ?? null;
  const selectedImportant = selected ? calendarEventViewModel(selected, overlay).important : false;

  const visibleDays = useMemo(() => {
    if (view === "day") return [dateAt(anchor)];
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart(anchor), index));
  }, [anchor, view]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEventViewModel[]>();
    for (const day of visibleDays) map.set(dateKey(day), []);
    for (const event of viewEvents) {
      const key = dateKey(event.start);
      map.get(key)?.push(event);
    }
    return map;
  }, [viewEvents, visibleDays]);

  function movePeriod(direction: -1 | 1) {
    if (view === "month") {
      const next = new Date(anchor);
      next.setMonth(anchor.getMonth() + direction);
      setAnchor(next);
      return;
    }
    setAnchor(addDays(anchor, view === "day" ? direction : direction * 7));
  }

  const panPeriod = useCallback((direction: -1 | 1) => {
    setAnchor((current) => {
      if (view === "month") {
        const next = new Date(current);
        next.setMonth(current.getMonth() + direction);
        return next;
      }
      return addDays(current, view === "day" ? direction : direction * 7);
    });
  }, [view]);

  async function removeEvent(event: CalendarEvent) {
    if (!window.confirm("Удалить событие? Это действие нельзя отменить.")) return;
    try {
      if (event.id.startsWith("agent-suggestion-")) {
        setSuggestedEvents((current) => current.filter((item) => item.id !== event.id));
      } else {
        await deleteCalendarEvent(event.id);
        await load();
      }
      setMenuOpen(false);
      setToast("Событие удалено");
    } catch (event) {
      setToast(event instanceof Error ? event.message : "Не удалось удалить событие");
    }
  }

  async function resizeEvent(event: CalendarEvent, nextStart: Date, nextEnd: Date) {
    const startsAt = nextStart.toISOString();
    const endsAt = nextEnd.toISOString();
    if (event.id.startsWith("agent-suggestion-") || event.id.startsWith("local-")) {
      setSuggestedEvents((current) => current.map((item) => item.id === event.id ? { ...item, starts_at: startsAt, ends_at: endsAt, updated_at: new Date().toISOString() } : item));
      setToast("Длительность обновлена");
      return;
    }
    try {
      const saved = await updateCalendarEvent(event.id, {
        title: event.title,
        scope: eventScope(event),
        description: event.description,
        starts_at: startsAt,
        ends_at: endsAt,
        location: event.location,
        remind_at: reminderDate(event.starts_at, reminderOffsetMinutes(event)),
      });
      setEvents((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSelectedId(saved.id);
      setToast("Длительность обновлена");
    } catch (event) {
      setToast(event instanceof Error ? event.message : "Не удалось изменить длительность");
    }
  }

  return (
    <main className={`${s.calendar} ${selected ? s["calendar--eventSelected"] : ""}`} data-view={view}>
      <section className={s.calendar__workspace}>
        <header className={s.calendar__header}>
          <button className={s.calendar__mobileMenu} aria-label="Открыть меню" onClick={onMenu}>
            <Menu />
          </button>
          <div className={s.calendar__titleWrap}>
            <h1>Календарь</h1>
            <p>Личные и рабочие события</p>
          </div>
          <div className={s.calendar__headerActions}>
            <button className={s.calendar__secondary} type="button" aria-expanded={connectionsOpen} onClick={() => setConnectionsOpen((open) => !open)}>
              Google
            </button>
            <button className={s.calendar__secondary} onClick={() => setModal("new")}>
              <Plus />
              Новое событие
            </button>
          </div>
        </header>

        {connectionsOpen && <GoogleCalendarConnections onSynced={() => void load()} />}

        <div className={s.calendar__toolbar}>
          <div className={s.calendar__toolbarLeft}>
            <button className={s.calendar__iconButton} aria-label="Предыдущий период" onClick={() => movePeriod(-1)}>
              <ChevronLeft />
            </button>
            <button className={s.calendar__iconButton} aria-label="Следующий период" onClick={() => movePeriod(1)}>
              <ChevronRight />
            </button>
            <button className={s.calendar__secondary} onClick={() => setAnchor(new Date())}>Сегодня</button>
            <div className={s.calendar__monthPicker} ref={monthPickerRef}>
              <button
                className={s.calendar__monthTitle}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={monthPickerOpen}
                onClick={() => {
                  setMonthPickerYear(anchor.getFullYear());
                  setMonthPickerOpen((value) => !value);
                }}
              >
                {monthLabel(anchor)}
                <ChevronDown className={monthPickerOpen ? s["calendar__monthChevron--open"] : undefined} />
              </button>
              {monthPickerOpen && (
                <div className={s.calendar__monthMenu} role="dialog" aria-label="Выбор месяца">
                  <header>
                    <button type="button" aria-label="Предыдущий год" onClick={() => setMonthPickerYear((year) => year - 1)}><ChevronLeft /></button>
                    <strong>{monthPickerYear}</strong>
                    <button type="button" aria-label="Следующий год" onClick={() => setMonthPickerYear((year) => year + 1)}><ChevronRight /></button>
                  </header>
                  <div>
                    {monthNames.map((name, monthIndex) => {
                      const selected = anchor.getFullYear() === monthPickerYear && anchor.getMonth() === monthIndex;
                      return <button key={name} type="button" className={selected ? s["calendar__monthOption--active"] : undefined} aria-pressed={selected} onClick={() => {
                        const lastDay = new Date(monthPickerYear, monthIndex + 1, 0).getDate();
                        setAnchor(new Date(monthPickerYear, monthIndex, Math.min(anchor.getDate(), lastDay), anchor.getHours(), anchor.getMinutes()));
                        setMonthPickerOpen(false);
                      }}>{name}</button>;
                    })}
                  </div>
                </div>
              )}
            </div>
            <span className={s.calendar__range}>{periodLabel(range.start, view === "week" ? addDays(range.start, 6) : range.end)}</span>
          </div>
          <div className={s.calendar__toolbarRight}>
            <div className={s.calendar__controlGroup}>
              {[
                ["", "Все"],
                ["work", "Рабочее"],
                ["personal", "Личное"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`${s.calendar__scopeButton} ${scope === value ? s["calendar__scopeButton--active"] : ""}`}
                  onClick={() => setScope(value as ScopeFilter)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={s.calendar__viewGroup}>
              {[
                ["day", "День"],
                ["week", "Неделя"],
                ["month", "Месяц"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`${s.calendar__viewButton} ${view === value ? s["calendar__viewButton--active"] : ""}`}
                  aria-pressed={view === value}
                  onClick={() => setRequestedView(value as ViewMode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <AgentSuggestions
          items={dynamicSuggestions}
          addedIds={addedSuggestionIds}
          onAdd={(item) => {
            const event = suggestionEvent(item);
            setSuggestedEvents((current) => current.some(({ id }) => id === event.id) ? current : [...current, event]);
            setSelectedId(event.id);
            setScope("");
          }}
        />

        {!error && loading && <div className={s.calendar__state}>Загружаем события...</div>}
        {error && <div className={s.calendar__state} role="alert">{error}</div>}
        {view === "month" ? (
          <MonthView
            anchor={anchor}
            events={displayEvents}
            selectedId={selected?.id ?? ""}
            onSelect={setSelectedId}
          />
        ) : (
          <div className={s.calendar__timelineViewport} data-timeline-viewport role="region" aria-label={view === "day" ? "Календарь на день" : "Календарь: горизонтальная прокрутка недели"} tabIndex={0}>
            <WeekGrid
              days={visibleDays}
              eventsByDay={eventsByDay}
              selectedId={selected?.id ?? ""}
              onSelect={setSelectedId}
              onResize={(event, start, end) => { resizeEvent(event, start, end).catch((error: unknown) => setToast(error instanceof Error ? error.message : "Не удалось изменить длительность")); }}
              onPanNavigate={panPeriod}
            />
          </div>
        )}
        {hasMore && (
          <button className={s.calendar__secondary} onClick={() => { void load(offset + limit); }}>
            Загрузить еще
          </button>
        )}
      </section>

      <EventPanel
        event={selected}
        menuOpen={menuOpen}
        onClose={() => setSelectedId("")}
        onEdit={(event) => setModal(event)}
        onToggleMenu={() => setMenuOpen((value) => !value)}
        onDelete={(event) => { void removeEvent(event); }}
        important={selectedImportant}
        onToggleImportant={(important) => selected && setImportant(selected.id, important)}
      />

      {modal && (
        <EventDialog
          item={modal === "new" ? undefined : modal}
          anchor={anchor}
          onClose={() => setModal(null)}
          important={modal === "new" ? false : calendarEventViewModel(modal, overlay).important}
          onSaved={async (event, important) => {
            setModal(null);
            setSelectedId(event.id);
            setImportant(event.id, important);
            setToast("Событие сохранено");
            await load();
          }}
        />
      )}
      {toast && <div className={s.calendar__toast} role="status">{toast}</div>}
    </main>
  );
}

function AgentSuggestions({
  items,
  addedIds,
  onAdd,
}: {
  items: AgentSuggestion[];
  addedIds: Set<string>;
  onAdd: (item: AgentSuggestion) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className={s.calendar__suggestions} aria-labelledby="agent-suggestions-title">
      <div className={s.calendar__suggestionsHead}>
        <div className={s.calendar__suggestionsIntro}>
          <div>
            <h2 id="agent-suggestions-title">Предложения агента</h2>
            <p>Свободное время в выбранном периоде календаря</p>
          </div>
        </div>
        <div className={s.calendar__insightChips}>
          <span>Время указано в часовом поясе устройства</span>
          <span>Источник: календарь</span>
        </div>
      </div>
      <div className={s.calendar__suggestionGrid}>
        {items.map((item) => {
          const added = addedIds.has(item.id);
          return (
          <article className={s.calendar__suggestionCard} key={item.id}>
            <div>
              <h3>{item.dateLabel} · {item.startTime}–{item.endDateLabel && `${item.endDateLabel}, `}{item.endTime}</h3>
              <p>{item.reason}</p>
            </div>
            <button type="button" disabled={added} onClick={() => onAdd(item)}>
              {added ? "Добавлено" : "Добавить"}
            </button>
          </article>
          );
        })}
      </div>
    </section>
  );
}

function WeekGrid({
  days,
  eventsByDay,
  selectedId,
  onSelect,
  onResize,
  onPanNavigate,
}: {
  days: Date[];
  eventsByDay: Map<string, CalendarEventViewModel[]>;
  selectedId: string;
  onSelect: (id: string) => void;
  onResize: (event: CalendarEvent, startsAt: Date, endsAt: Date) => void;
  onPanNavigate: (direction: -1 | 1) => void;
}) {
  const selectedDay = new Date();
  const [panOffset, setPanOffset] = useState(0);
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ pointerId: number; startX: number; residual: number } | null>(null);
  const style = { "--days": days.length, "--pan-offset": `${panOffset}px` } as CSSProperties;
  const threshold = 140;

  function finishPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!pan.current || pan.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pan.current = null;
    setPanning(false);
    setPanOffset(0);
  }

  return (
    <div
      className={`${s.calendar__week} ${panning ? s["calendar__week--panning"] : ""}`}
      style={style}
      onAuxClick={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onPointerDownCapture={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        pan.current = { pointerId: event.pointerId, startX: event.clientX, residual: 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
        setPanning(true);
        setPanOffset(0);
      }}
      onPointerMove={(event) => {
        const current = pan.current;
        if (!current || current.pointerId !== event.pointerId) return;
        event.preventDefault();
        const total = event.clientX - current.startX + current.residual;
        let residual = total;
        while (residual <= -threshold) {
          onPanNavigate(1);
          residual += threshold;
        }
        while (residual >= threshold) {
          onPanNavigate(-1);
          residual -= threshold;
        }
        pan.current = { ...current, startX: event.clientX, residual };
        setPanOffset(Math.max(-threshold, Math.min(threshold, residual)) * 0.28);
      }}
      onPointerUp={finishPan}
      onPointerCancel={finishPan}
      onLostPointerCapture={(event) => {
        if (!pan.current || pan.current.pointerId !== event.pointerId) return;
        pan.current = null;
        setPanning(false);
        setPanOffset(0);
      }}
    >
      <div />
      <div className={s.calendar__dayHeaders}>
        {days.map((day) => (
          <div className={`${s.calendar__dayHead} ${sameDay(day, selectedDay) ? s["calendar__dayHead--selected"] : ""}`} key={dateKey(day)}>
            <span>{day.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "")}</span>
            <strong>{day.getDate()}</strong>
          </div>
        ))}
      </div>
      <div className={s.calendar__allDayLabel}>Весь день</div>
      <div className={s.calendar__allDayCells}>{days.map((day) => <span key={dateKey(day)} />)}</div>
      <div className={s.calendar__timeLabels}>
        {Array.from({ length: DAY_END - DAY_START }, (_, index) => (
          <span key={index}>{String(DAY_START + index).padStart(2, "0")}:00</span>
        ))}
      </div>
      <div className={s.calendar__grid}>
        {days.map((day) => (
          <CalendarDayColumn
            key={dateKey(day)}
            day={day}
            today={selectedDay}
            events={eventsByDay.get(dateKey(day)) ?? []}
            selectedId={selectedId}
            onSelect={onSelect}
            onResize={onResize}
          />
        ))}
      </div>
    </div>
  );
}

function CalendarDayColumn({
  day,
  today,
  events,
  selectedId,
  onSelect,
  onResize,
}: {
  day: Date;
  today: Date;
  events: CalendarEventViewModel[];
  selectedId: string;
  onSelect: (id: string) => void;
  onResize: (event: CalendarEvent, startsAt: Date, endsAt: Date) => void;
}) {
  const columnRef = useRef<HTMLDivElement>(null);
  const [visibleCapacity, setVisibleCapacity] = useState(2);

  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const update = () => setVisibleCapacity(visibleCapacityForWidth(column.getBoundingClientRect().width));
    const observer = new ResizeObserver(update);
    observer.observe(column);
    return () => observer.disconnect();
  }, []);

  const clusters = useMemo(() => {
    const visibleStart = dateAt(day, DAY_START);
    const visibleEnd = dateAt(day, DAY_END);
    return layoutOverlappingEvents(
      clipEventsToVisibleRange(events, visibleStart, visibleEnd),
      visibleCapacity,
    );
  }, [day, events, visibleCapacity]);

  return (
    <div
      ref={columnRef}
      className={`${s.calendar__dayColumn} ${sameDay(day, today) ? s["calendar__dayColumn--selected"] : ""} ${day.getDay() === 0 || day.getDay() === 6 ? s["calendar__dayColumn--weekend"] : ""}`}
    >
      {clusters.map((cluster) => (
        <div className={s.calendar__cluster} key={cluster.id}>
          {cluster.visible.map(({ event, lane, lanes }) => (
            <EventBlock
              key={event.id}
              event={event}
              selected={event.id === selectedId}
              onSelect={() => onSelect(event.id)}
              onResize={(startsAt, endsAt) => onResize(event.source, startsAt, endsAt)}
              lane={lane}
              lanes={lanes}
            />
          ))}
          {cluster.hidden.length > 0 && <OverflowControl cluster={cluster} onSelect={onSelect} />}
        </div>
      ))}
    </div>
  );
}

function EventBlock({
  event,
  selected,
  onSelect,
  onResize,
  lane,
  lanes,
}: {
  event: CalendarEventViewModel;
  selected: boolean;
  onSelect: () => void;
  onResize: (startsAt: Date, endsAt: Date) => void;
  lane: number;
  lanes: number;
}) {
  const [previewMinutes, setPreviewMinutes] = useState<number | null>(null);
  const [previewStartMs, setPreviewStartMs] = useState<number | null>(null);
  const previewMinutesRef = useRef<number | null>(null);
  const sourceStart = parseEventDate(event.source.starts_at);
  const sourceEnd = event.source.ends_at
    ? parseEventDate(event.source.ends_at)
    : new Date(sourceStart.getTime() + MIN_EVENT_MINUTES * 60000);
  const visibleDayStart = dateAt(sourceStart, DAY_START).getTime();
  const visibleDayEnd = dateAt(sourceStart, DAY_END).getTime();
  const previewActualStart = previewStartMs ?? sourceStart.getTime();
  const previewActualEnd = previewMinutes === null
    ? sourceEnd.getTime()
    : previewActualStart + previewMinutes * 60000;
  const visualStart = new Date(Math.max(visibleDayStart, previewActualStart));
  const visualEnd = new Date(Math.min(visibleDayEnd, previewActualEnd));
  const startHour = visualStart.getHours() + visualStart.getMinutes() / 60;
  const duration = Math.max(0, Math.round((visualEnd.getTime() - visualStart.getTime()) / 60000));
  const totalHours = DAY_END - DAY_START;
  const top = Math.max(0, (startHour - DAY_START) / totalHours * 100);
  const height = duration / 60 / totalHours * 100;
  function beginResize(edge: "start" | "end", pointerEvent: React.PointerEvent<HTMLSpanElement>) {
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    const originY = pointerEvent.clientY;
    const originStart = sourceStart.getTime();
    const originEnd = sourceEnd.getTime();
    const target = pointerEvent.currentTarget;
    const gridHeight = target.closest(`.${s.calendar__dayColumn}`)?.getBoundingClientRect().height ?? 0;
    const pixelsPerHour = gridHeight > 0 ? gridHeight / totalHours : 40;
    const viewport = target.closest<HTMLElement>("[data-timeline-viewport]");
    const originScrollTop = viewport?.scrollTop ?? 0;
    target.setPointerCapture(pointerEvent.pointerId);
    const move = (moveEvent: PointerEvent) => {
      if (viewport) {
        const box = viewport.getBoundingClientRect();
        if (moveEvent.clientY < box.top + 48) viewport.scrollTop -= 14;
        else if (moveEvent.clientY > box.bottom - 48) viewport.scrollTop += 14;
      }
      const deltaPixels = moveEvent.clientY - originY + ((viewport?.scrollTop ?? 0) - originScrollTop);
      const deltaMinutes = Math.round((deltaPixels / pixelsPerHour) * 60 / RESIZE_STEP_MINUTES) * RESIZE_STEP_MINUTES;
      const dayStart = new Date(sourceStart); dayStart.setHours(DAY_START, 0, 0, 0);
      const dayEnd = new Date(sourceStart); dayEnd.setHours(DAY_END, 0, 0, 0);
      const nextStartMs = edge === "start" ? Math.max(dayStart.getTime(), Math.min(originEnd - MIN_EVENT_MINUTES * 60000, originStart + deltaMinutes * 60000)) : originStart;
      const nextEndMs = edge === "end" ? Math.min(dayEnd.getTime(), Math.max(originStart + MIN_EVENT_MINUTES * 60000, originEnd + deltaMinutes * 60000)) : originEnd;
      const next = Math.round((nextEndMs - nextStartMs) / 60000);
      previewMinutesRef.current = next;
      target.dataset.nextStart = String(nextStartMs);
      target.dataset.nextEnd = String(nextEndMs);
      setPreviewStartMs(nextStartMs);
      setPreviewMinutes(next);
    };
    const up = (upEvent: PointerEvent) => {
      if (target.hasPointerCapture(upEvent.pointerId)) {
        target.releasePointerCapture(upEvent.pointerId);
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const nextDuration = previewMinutesRef.current;
      const nextStart = Number(target.dataset.nextStart || originStart);
      const nextEnd = Number(target.dataset.nextEnd || originEnd);
      previewMinutesRef.current = null;
      setPreviewMinutes(null);
      setPreviewStartMs(null);
      delete target.dataset.nextStart;
      delete target.dataset.nextEnd;
      if (nextDuration !== null && (nextStart !== originStart || nextEnd !== originEnd)) onResize(new Date(nextStart), new Date(nextEnd));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }
  return (
    <button
      className={`${s.calendar__event} ${lanes > 1 ? s["calendar__event--mini"] : ""} ${event.colorVariant === "orange" ? s["calendar__event--orange"] : ""} ${event.colorVariant === "green" ? s["calendar__event--green"] : ""} ${event.important ? s["calendar__event--important"] : ""} ${selected ? s["calendar__event--selected"] : ""} ${event.source.source_type === "google_calendar" ? s["calendar__event--google"] : ""} ${duration <= 30 ? s["calendar__event--compact"] : ""}`}
      style={{ "--event-top": top, "--event-height": height, "--event-lane": lane, "--event-right-lanes": lanes - lane - 1, "--event-lanes": lanes } as CSSProperties}
      onClick={onSelect}
    >
      {isAgentEvent(event.source) && duration >= 60 && (
        <span className={s.calendar__agentEventLabel}>Предложено агентом</span>
      )}
      {event.important && <Star className={s.calendar__eventStar} aria-label="Важное событие" fill="currentColor" />}
      <span className={s.calendar__eventTitle}>{event.title}</span>
      {duration > 30 && (
        <span className={s.calendar__eventTime}>
          {timePart(event.source.starts_at)}{event.source.ends_at ? ` - ${timePart(event.source.ends_at)}` : ""}
        </span>
      )}
      <span className={`${s.calendar__resizeHandle} ${s["calendar__resizeHandle--top"]}`} aria-hidden="true" onPointerDown={(event) => beginResize("start", event)} />
      <span className={`${s.calendar__resizeHandle} ${s["calendar__resizeHandle--bottom"]}`} aria-hidden="true" onPointerDown={(event) => beginResize("end", event)} />
    </button>
  );
}

function OverflowControl({ cluster, onSelect }: { cluster: CalendarEventCluster; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const totalHours = DAY_END - DAY_START;
  const endHour = sameDay(cluster.start, cluster.end)
    ? cluster.end.getHours() + cluster.end.getMinutes() / 60
    : DAY_END;
  const top = Math.max(0, (endHour - DAY_START) / totalHours * 100);
  const hiddenImportant = cluster.hidden.some((event) => event.important);

  const place = useCallback(() => {
    const box = anchorRef.current?.getBoundingClientRect();
    if (!box) return;
    const width = 300;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, box.left));
    const estimatedHeight = expanded ? 330 : 250;
    const topPosition = box.bottom + 8 + estimatedHeight > window.innerHeight
      ? Math.max(12, box.top - estimatedHeight - 8)
      : box.bottom + 8;
    setPosition({ top: topPosition, left });
  }, [expanded]);

  useEffect(() => {
    if (!open) return;
    place();
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        anchorRef.current?.focus();
      }
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", keydown);
    };
  }, [open, place]);

  const shown = expanded ? cluster.all : cluster.hidden;
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={s.calendar__moreButton}
        style={{ "--overflow-top": top } as CSSProperties}
        aria-label={`Показать ещё ${cluster.hidden.length} события`}
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); setExpanded(false); }}
      >
        {hiddenImportant && <Star aria-hidden="true" fill="currentColor" />}
        +{cluster.hidden.length} ещё <ChevronDown aria-hidden="true" />
      </button>
      {open && createPortal((
        <div
          ref={popoverRef}
          className={s.calendar__morePopover}
          style={{ top: position.top, left: position.left }}
          role="dialog"
          aria-label={`Ещё ${cluster.hidden.length} события`}
        >
          <header>
            <strong>{expanded ? `Все события (${cluster.all.length})` : `Ещё ${cluster.hidden.length} события`}</strong>
            <button type="button" aria-label="Закрыть" onClick={() => setOpen(false)}><X /></button>
          </header>
          <div className={s.calendar__moreList}>
            {shown.map((event) => (
              <button key={event.id} type="button" onClick={() => { setOpen(false); onSelect(event.id); }}>
                <span className={`${s.calendar__moreDot} ${event.source.source_type === "google_calendar" ? s["calendar__moreDot--google"] : ""}`} />
                <span><b>{event.title}</b><small>{timePart(event.source.starts_at)} - {timePart(event.source.ends_at ?? event.source.starts_at)}</small></span>
                {event.important && <Star aria-label="Важное событие" fill="currentColor" />}
              </button>
            ))}
          </div>
          {!expanded && <button className={s.calendar__showAll} type="button" onClick={() => setExpanded(true)}>Показать все ({cluster.all.length})</button>}
        </div>
      ), document.body)}
    </>
  );
}

function MonthView({
  anchor,
  events,
  selectedId,
  onSelect,
}: {
  anchor: Date;
  events: CalendarEvent[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const first = weekStart(monthStart(anchor));
  const days = Array.from({ length: 42 }, (_, index) => addDays(first, index));
  return (
    <div className={s.calendar__monthGrid}>
      {days.map((day) => {
        const key = dateKey(day);
        return (
          <div className={s.calendar__monthCell} key={key}>
            <strong>{day.getDate()}</strong>
            {events
              .filter((event) => dateKey(parseEventDate(event.starts_at)) === key)
              .slice(0, 3)
              .map((event) => (
                <button
                  key={event.id}
                  className={`${s.calendar__monthEvent} ${event.id === selectedId ? s["calendar__monthEvent--selected"] : ""} ${event.source_type === "google_calendar" ? s["calendar__monthEvent--google"] : ""}`}
                  onClick={() => onSelect(event.id)}
                >
                  {timePart(event.starts_at)} {event.title}
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}

function EventPanel({
  event,
  menuOpen,
  onClose,
  onEdit,
  onToggleMenu,
  onDelete,
  important,
  onToggleImportant,
}: {
  event: CalendarEvent | null;
  menuOpen: boolean;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onToggleMenu: () => void;
  onDelete: (event: CalendarEvent) => void;
  important: boolean;
  onToggleImportant: (important: boolean) => void;
}) {
  return (
    <aside className={s.calendar__panel}>
      <div className={s.calendar__panelHead}>
        <h2>Событие</h2>
        <button aria-label="Закрыть панель" onClick={onClose}><X /></button>
      </div>
      {event ? (
        <>
          <span className={s.calendar__badge}>{scopeLabel(eventScope(event))}</span>
          {event.source_type === "google_calendar" && <span className={`${s.calendar__badge} ${s["calendar__badge--google"]}`}>Google</span>}
          <div className={s.calendar__panelTitleRow}>
            <h3 className={s.calendar__panelTitle}>{event.title}</h3>
            <button
              type="button"
              className={`${s.calendar__importantStar} ${important ? s["calendar__importantStar--active"] : ""}`}
              aria-label={important ? "Убрать из важных" : "Пометить как важное"}
              aria-pressed={important}
              onClick={() => onToggleImportant(!important)}
            ><Star fill={important ? "currentColor" : "none"} /></button>
          </div>
          <div className={s.calendar__actions}>
            <button className={s.calendar__primary} onClick={() => onEdit(event)}>
              <Pencil />
              Изменить
            </button>
            <button className={s.calendar__overflow} aria-label="Еще" onClick={onToggleMenu}>
              <Ellipsis />
            </button>
          </div>
          {menuOpen && (
            <div className={s.calendar__overflowMenu}>
              <button onClick={() => onEdit(event)}><Pencil /> Изменить</button>
              <button onClick={() => onToggleImportant(!important)}><Star /> {important ? "Убрать из важных" : "Пометить как важное"}</button>
              <button className={s.calendar__dangerAction} onClick={() => onDelete(event)}><Trash2 /> Удалить событие</button>
            </div>
          )}
          <div className={s.calendar__details}>
            <Detail icon={CalendarDays} label="Дата" value={fullDate(event.starts_at)} />
            <Detail icon={Clock} label="Время" value={`${timePart(event.starts_at)}${event.ends_at ? ` - ${timePart(event.ends_at)}` : ""}`} />
            {event.location && <Detail icon={MapPin} label="Место" value={event.location} />}
            <Detail icon={Bell} label="Напоминание" value={reminderLabel(event)} />
          </div>
          <div className={s.calendar__importantSection}>
            <div>
              <strong><Star fill={important ? "currentColor" : "none"} /> Важное событие</strong>
              <p>Будет выделено в календаре<br />и в уведомлениях</p>
            </div>
            <button
              type="button"
              className={`${s.calendar__switch} ${important ? s["calendar__switch--on"] : ""}`}
              role="switch"
              aria-checked={important}
              aria-label="Важное событие"
              onClick={() => onToggleImportant(!important)}
            ><span /></button>
          </div>
          {event.description && (
            <div className={s.calendar__detail}>
              <FileText />
              <p className={s.calendar__description}>{event.description}</p>
            </div>
          )}
          <p className={s.calendar__created}>
            <Clock />
            Создано {fullDate(event.created_at)}, {timePart(event.created_at)}
          </p>
          {isAgentEvent(event) && <AgentEventContext reason={event.description} />}
        </>
      ) : (
        <p className={s.calendar__muted}>Выберите событие в календаре.</p>
      )}
    </aside>
  );
}

function AgentEventContext({ reason }: { reason: string }) {
  const links = [
    { icon: Mail, title: "Письмо Марии", note: "" },
    { icon: FileText, title: "Supply contract.pdf", note: "" },
    { icon: BrainCircuit, title: "Предпочитает встречи утром", note: "" },
  ];
  return (
    <div className={s.calendar__agentContext}>
      <section>
        <h4>Почему предложено</h4>
        <ul className={s.calendar__reasonList}>
          <li>{reason || "Письмо Марии связано со встречей"}</li>
          <li>Участники свободны в это время</li>
          <li>Вы обычно выбираете встречи утром</li>
        </ul>
      </section>
      <section>
        <h4>Связанный контекст</h4>
        <div className={s.calendar__contextLinks}>
          {links.map(({ icon: Icon, title, note }) => (
            <button type="button" key={title}>
              <Icon />
              <span><b>{title}</b>{note && <small> — {note}</small>}</span>
              <ChevronRight />
            </button>
          ))}
        </div>
      </section>
      <section>
        <h4>Действия</h4>
        <div className={s.calendar__agentActions}>
          <button type="button" className={s.calendar__highlightAction}><CalendarCheck /> Подготовить встречу</button>
          <button type="button"><Search /> Найти другой слот</button>
          <button type="button"><Bell /> Создать напоминание</button>
          <button type="button"><CalendarCheck /> Добавить задачу</button>
        </div>
      </section>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className={s.calendar__detail}>
      <Icon />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function EventDialog({
  item,
  anchor,
  onClose,
  onSaved,
  important: initialImportant,
}: {
  item?: CalendarEvent;
  anchor: Date;
  onClose: () => void;
  onSaved: (event: CalendarEvent, important: boolean) => Promise<void>;
  important: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const start = item ? parseEventDate(item.starts_at) : dateAt(anchor, 10);
  const end = item?.ends_at ? parseEventDate(item.ends_at) : dateAt(anchor, 10, 30);
  const [title, setTitle] = useState(item?.title ?? "");
  const [scope, setScope] = useState<CalendarScope>(item ? eventScope(item) : "personal");
  const [date, setDate] = useState(dateKey(start));
  const [startTime, setStartTime] = useState(timePart(start.toISOString()));
  const [endTime, setEndTime] = useState(item?.ends_at ? timePart(end.toISOString()) : "");
  const [location, setLocation] = useState(item?.location ?? "");
  const [reminder, setReminder] = useState("30");
  const [description, setDescription] = useState(item?.description ?? "");
  const [important, setImportant] = useState(initialImportant);
  const [error, setError] = useState("");

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const starts_at = localDateTime(date, startTime);
    const ends_at = endTime ? localDateTime(date, endTime) : null;
    if (ends_at && new Date(ends_at) <= new Date(starts_at)) {
      setError("Окончание должно быть позже начала.");
      return;
    }
    const payload: CalendarEventPayload = {
      title,
      scope,
      description,
      starts_at,
      ends_at,
      location: location || null,
      remind_at: reminderDate(starts_at, Number(reminder)),
    };
    try {
      const saved = item && !item.id.startsWith("demo-")
        ? await updateCalendarEvent(item.id, payload)
        : await createCalendarEvent(payload);
      await onSaved(saved, important);
    } catch (event) {
      setError(event instanceof CalendarApiError ? event.message : "Не удалось сохранить событие");
    }
  }

  return (
    <dialog
      className={s.calendar__dialog}
      aria-labelledby="calendar-event-dialog-title"
      ref={ref}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header>
        <h2 id="calendar-event-dialog-title">{item ? "Изменить событие" : "Новое событие"}</h2>
        <button aria-label="Закрыть окно" onClick={onClose}><X /></button>
      </header>
      <form className={s.calendar__form} onSubmit={(event) => { submit(event).catch((error: unknown) => setError(error instanceof Error ? error.message : "Не удалось сохранить событие")); }}>
        <label>
          <span>Название *</span>
          <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className={s.calendar__fieldControl}>
          <span>Тип</span>
          <RestoreSelect label="Тип события" value={scope} options={eventScopeOptions} onChange={setScope} showLabel={false} />
        </div>
        <div className={s.calendar__formRow}>
          <div className={s.calendar__fieldControl}>
            <span>Дата *</span>
            <RestoreDatePicker label="Дата события" value={date} onChange={setDate} allowClear={false} />
          </div>
          <div className={s.calendar__fieldControl}>
            <span>Начало *</span>
            <RestoreTimePicker label="Начало" value={startTime} onChange={setStartTime} required />
          </div>
          <div className={s.calendar__fieldControl}>
            <span>Окончание</span>
            <RestoreTimePicker label="Окончание" value={endTime} onChange={setEndTime} />
          </div>
        </div>
        <label className={s.calendar__importantFormOption}>
          <span><Star fill={important ? "currentColor" : "none"} /> Важное событие</span>
          <input type="checkbox" checked={important} onChange={(event) => setImportant(event.target.checked)} />
        </label>
        <label>
          <span>Место</span>
          <input maxLength={255} value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <div className={s.calendar__fieldControl}>
          <span>Напоминание</span>
          <RestoreSelect label="Напоминание" value={reminder} options={reminderOptions} onChange={setReminder} showLabel={false} />
        </div>
        <label>
          <span>Описание</span>
          <textarea maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {error && <p className={s.calendar__formError}>{error}</p>}
        <footer>
          <button type="button" className={s.calendar__secondary} onClick={onClose}>Отмена</button>
          <button className={s.calendar__primary}>{item ? "Сохранить" : "Создать"}</button>
        </footer>
      </form>
    </dialog>
  );
}
