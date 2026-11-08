import type { CalendarLocalEventOverlay } from "../types";

export const CALENDAR_OVERLAY_STORAGE_KEY = "restore-agent:calendar-v2:overlay:v1";

export type CalendarOverlay = Record<string, CalendarLocalEventOverlay>;

function browserStorage() {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCalendarOverlay(value: unknown): value is CalendarOverlay {
  return isRecord(value) && Object.values(value).every(entry =>
    isRecord(entry) && (entry.important === undefined || typeof entry.important === "boolean"));
}

export function readCalendarOverlay(storage: Pick<Storage, "getItem"> | undefined = browserStorage()): CalendarOverlay {
  if (!storage) return {};
  try {
    const value: unknown = JSON.parse(storage.getItem(CALENDAR_OVERLAY_STORAGE_KEY) ?? "{}");
    return isCalendarOverlay(value) ? value : {};
  } catch {
    return {};
  }
}

export function writeCalendarOverlay(overlay: CalendarOverlay, storage: Pick<Storage, "setItem"> | undefined = browserStorage()) {
  if (!storage) return;
  try {
    storage.setItem(CALENDAR_OVERLAY_STORAGE_KEY, JSON.stringify(overlay));
  } catch {
    // Importance is an enhancement; storage failures must not break the calendar.
  }
}

export function setEventImportance(overlay: CalendarOverlay, eventId: string, important: boolean): CalendarOverlay {
  return { ...overlay, [eventId]: { ...overlay[eventId], important } };
}

// TODO(calendar-backend): Replace the local importance overlay with a persisted event field.
