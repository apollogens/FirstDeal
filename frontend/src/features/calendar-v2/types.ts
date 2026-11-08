import type { CalendarEvent, CalendarScope } from "@/lib/calendar";

export type CalendarEventImportance = "important" | "normal";

export type CalendarEventViewModel = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
  reminder?: string;
  scope?: CalendarScope;
  important: boolean;
  colorVariant?: "neutral" | "orange" | "green";
  createdAt?: string;
  source: CalendarEvent;
};

export type CalendarLocalEventOverlay = {
  important?: boolean;
};
