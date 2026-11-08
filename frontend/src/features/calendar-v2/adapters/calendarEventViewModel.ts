import type { CalendarEvent } from "@/lib/calendar";
import type { CalendarOverlay } from "./calendarLocalOverlay";
import type { CalendarEventViewModel } from "../types";

type FutureCalendarEvent = CalendarEvent & { important?: boolean };

const colorVariants = ["neutral", "orange", "green"] as const;

function stableColorVariant(eventId: string) {
  let hash = 0;
  for (let index = 0; index < eventId.length; index += 1) {
    hash = ((hash << 5) - hash + eventId.charCodeAt(index)) | 0;
  }
  return colorVariants[Math.abs(hash) % colorVariants.length];
}

export function calendarEventViewModel(event: CalendarEvent, overlay: CalendarOverlay): CalendarEventViewModel {
  const futureEvent = event as FutureCalendarEvent;
  const start = new Date(event.starts_at);
  return {
    id: event.id,
    title: event.title,
    start,
    end: event.ends_at ? new Date(event.ends_at) : new Date(start.getTime() + 30 * 60_000),
    location: event.location ?? undefined,
    description: event.description || undefined,
    reminder: event.remind_at,
    scope: event.scope,
    important: overlay[event.id]?.important ?? futureEvent.important ?? false,
    colorVariant: stableColorVariant(event.id),
    createdAt: event.created_at,
    source: event,
  };
}

// TODO(calendar-backend): Allow assistant-created calendar actions to persist event importance.
