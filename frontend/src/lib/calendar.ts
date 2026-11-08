import { isDateString } from "./api-validation";

export type CalendarScope = "personal" | "work";

export type CalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  source_type?: string | null;
  scope?: CalendarScope;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  remind_at: string;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarFilters = {
  date_from?: string;
  date_to?: string;
  scope?: CalendarScope;
  origin?: "local" | "google";
  limit?: number;
  offset?: number;
};

export type CalendarConnection = {
  id: string;
  provider: string;
  account_label: string | null;
  calendar_id: string;
  calendar_name: string | null;
  calendar_timezone: string | null;
  status: string;
  is_default: boolean;
  last_synced_at: string | null;
  last_error: string | null;
};

export type ExternalCalendar = {
  id: string;
  name: string;
  timezone: string | null;
  primary: boolean;
  access_role: string | null;
};

export type CalendarEventPayload = {
  title: string;
  description?: string;
  scope?: CalendarScope;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  remind_at?: string;
};

export class CalendarApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

const errorMessages: Record<string, string> = {
  "Calendar event not found": "Событие не найдено или уже удалено.",
  "date_from cannot be later than date_to":
    "Дата начала не может быть позже даты окончания.",
  "ends_at must be later than starts_at":
    "Окончание должно быть позже начала.",
  "remind_at cannot be later than starts_at":
    "Напоминание не может быть позже начала события.",
  "Invalid calendar event time":
    "Проверьте время начала, окончания и напоминания.",
};

function appendParams(path: string, values: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNull(value: unknown): value is null {
  return value === null;
}

function arrayOf<T>(guard: (value: unknown) => value is T) {
  return (value: unknown): value is T[] => Array.isArray(value) && value.every(guard);
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  return isRecord(value) &&
    ["id", "user_id", "title", "description"].every(key => typeof value[key] === "string") &&
    ["starts_at", "remind_at", "created_at", "updated_at"].every(key => isDateString(value[key])) &&
    ["ends_at", "reminder_sent_at"].every(key => value[key] === null || isDateString(value[key])) &&
    isNullableString(value.location) &&
    (value.source_type === undefined || isNullableString(value.source_type)) &&
    (value.scope === undefined || value.scope === "personal" || value.scope === "work");
}

function isCalendarConnection(value: unknown): value is CalendarConnection {
  return isRecord(value) &&
    ["id", "provider", "calendar_id", "status"].every(key => typeof value[key] === "string") &&
    ["account_label", "calendar_name", "calendar_timezone", "last_error"].every(key => isNullableString(value[key])) &&
    (value.last_synced_at === null || isDateString(value.last_synced_at)) &&
    typeof value.is_default === "boolean";
}

function isExternalCalendar(value: unknown): value is ExternalCalendar {
  return isRecord(value) &&
    ["id", "name"].every(key => typeof value[key] === "string") &&
    ["timezone", "access_role"].every(key => isNullableString(value[key])) &&
    typeof value.primary === "boolean";
}

function isConnectUrl(value: unknown): value is { connect_link_url: string } {
  return isRecord(value) &&
    typeof value.connect_link_url === "string";
}

function isSyncResult(value: unknown): value is Record<string, number> {
  return isRecord(value) &&
    Object.values(value).every(item => typeof item === "number" && Number.isInteger(item));
}

async function request<T>(
  path: string,
  guard: (value: unknown) => value is T,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const response = await fetch(`/api/calendar${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: method !== "GET" ? { "Content-Type": "application/json" } : undefined,
    body: method !== "GET" ? JSON.stringify(options.body ?? {}) : undefined,
    signal: options.signal,
  });
  const data: unknown = await response.json().catch(() => null);
  const error = isRecord(data) ? data : {};
  if (!response.ok) {
    const detail = typeof error.detail === "string" ? error.detail : "";
    const fields: Record<string, string> = {};
    if (response.status === 422 && Array.isArray(error.detail)) {
      for (const item of error.detail) {
        const field: unknown = isRecord(item) && Array.isArray(item.loc) ? item.loc.at(-1) : undefined;
        if (typeof field === "string") fields[field] = "Проверьте поле.";
      }
    }
    throw new CalendarApiError(
      response.status,
      errorMessages[detail] ||
        detail ||
        (typeof error.message === "string" ? error.message : "") ||
        `Не удалось выполнить запрос календаря (HTTP ${response.status}).`,
      fields,
    );
  }
  if (!guard(data)) throw new CalendarApiError(response.status, "Некорректный ответ сервера.");
  return data;
}

export const getCalendarEvents = (
  filters: CalendarFilters,
  signal?: AbortSignal,
) =>
  request<CalendarEvent[]>(
    appendParams("/events", filters),
    arrayOf(isCalendarEvent),
    { signal },
  );

export const createCalendarEvent = (body: CalendarEventPayload) =>
  request<CalendarEvent>("/events", isCalendarEvent, { method: "POST", body });

export const updateCalendarEvent = (
  id: string,
  body: Partial<CalendarEventPayload>,
) => request<CalendarEvent>(`/events/${id}`, isCalendarEvent, { method: "PATCH", body });

export const deleteCalendarEvent = (id: string) =>
  request<null>(`/events/${id}`, isNull, { method: "DELETE", body: {} });

export const getCalendarConnections = (signal?: AbortSignal) =>
  request<CalendarConnection[]>("/connections", arrayOf(isCalendarConnection), { signal });

export const disconnectCalendarConnection = (id: string) =>
  request<null>(`/connections/${encodeURIComponent(id)}`, isNull, { method: "DELETE" });

export const discoverCalendarConnections = () =>
  request<CalendarConnection[]>("/connections/sync", arrayOf(isCalendarConnection), { method: "POST" });

export const getGoogleCalendarConnectUrl = () =>
  request<{ connect_link_url: string }>("/connect-url", isConnectUrl);

export const syncCalendarConnection = (id: string) =>
  request<Record<string, number>>(`/connections/${encodeURIComponent(id)}/sync`, isSyncResult, { method: "POST" });

export const getExternalCalendars = (id: string) =>
  request<ExternalCalendar[]>(`/connections/${encodeURIComponent(id)}/calendars`, arrayOf(isExternalCalendar));

export const updateCalendarConnection = (id: string, calendarId: string) =>
  request<CalendarConnection>(`/connections/${encodeURIComponent(id)}`, isCalendarConnection, { method: "PATCH", body: { calendar_id: calendarId } });
