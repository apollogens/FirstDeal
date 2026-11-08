import { arrayOf, isDateString, isHttpUrl, isNumber, isRecord, isString, nullable, objectOf, oneOf, optional, type Guard } from "./api-validation";

export type NotificationStatus = "unread" | "read" | "dismissed";
export type NotificationScope = "personal" | "work";

export type NewsNotification = {
  id: string;
  kind: "news_digest";
  status: NotificationStatus;
  title: string;
  body: string;
  payload: {
    topic_id: string;
    topic: string;
    scope: NotificationScope;
    items: Array<{
      title: string;
      url: string;
      source: string;
      published_at: string | null;
    }>;
  };
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarReminderNotification = {
  id: string;
  kind: "calendar_reminder";
  status: NotificationStatus;
  title: string;
  body: string;
  payload: {
    event_id: string;
    scope: NotificationScope;
    title: string;
    starts_at: string;
    ends_at: string | null;
    location: string | null;
    remind_at: string;
  };
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventReminderNotification = Omit<CalendarReminderNotification, "payload"> & {
  payload: { reminder_id: string; title: string; remind_at: string };
};

export type NotificationCitation = {
  source_type: string;
  source_id?: string | null;
  evidence_id?: string | null;
  fact_id?: string | null;
  fact_key?: string | null;
  fact_value?: string | null;
  observed_at?: string | null;
};

export type MemoryNotification = {
  id: string;
  kind: "memory_attention" | "memory_changed";
  status: NotificationStatus;
  title: string;
  body: string;
  payload: {
    fact_id: string | null;
    decision_id: string | null;
    proposal_action_id: string | null;
    severity: string;
    action_type?: string | null;
    action_payload?: {
      title?: string | null;
      starts_at?: string | null;
      ends_at?: string | null;
      location?: string | null;
      scope?: string | null;
      description?: string | null;
      [key: string]: unknown;
    } | null;
    action_status?: "pending" | "confirmed" | "rejected" | "downgraded" | string | null;
    citations?: NotificationCitation[] | null;
    created_event_id?: string | null;
  };
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowCheckinNotification = {
  id: string;
  kind: "workflow_checkin";
  status: NotificationStatus;
  title: string;
  body: string;
  payload: { workflow_id: string; title: string };
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationConfirmResponse = {
  notification_id: string;
  action_status: string;
  created_event_id: string | null;
  status: string;
  action_type: string;
  message?: string;
};

export type Notification = NewsNotification | CalendarReminderNotification | EventReminderNotification | MemoryNotification | WorkflowCheckinNotification;

export class NotificationsApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const notificationFields = { id: isString, status: oneOf("unread", "read", "dismissed"), title: isString, body: isString, read_at: nullable(isDateString), dismissed_at: nullable(isDateString), created_at: isDateString, updated_at: isDateString };
const isCitation = objectOf<NotificationCitation>({ source_type: isString, source_id: optional(nullable(isString)), evidence_id: optional(nullable(isString)), fact_id: optional(nullable(isString)), fact_key: optional(nullable(isString)), fact_value: optional(nullable(isString)), observed_at: optional(nullable(isString)) });
const isMemoryActionPayload: Guard<NonNullable<MemoryNotification["payload"]["action_payload"]>> = (value): value is NonNullable<MemoryNotification["payload"]["action_payload"]> =>
  isRecord(value) && ["title", "starts_at", "ends_at", "location", "scope", "description"].every(key => value[key] === undefined || value[key] === null || typeof value[key] === "string");
const isMemory = objectOf<MemoryNotification>({ ...notificationFields, kind: oneOf("memory_attention", "memory_changed"), payload: objectOf<MemoryNotification["payload"]>({ fact_id: nullable(isString), decision_id: nullable(isString), proposal_action_id: nullable(isString), severity: isString, action_type: optional(nullable(isString)), action_payload: optional(nullable(isMemoryActionPayload)), action_status: optional(nullable(isString)), citations: optional(nullable(arrayOf(isCitation))), created_event_id: optional(nullable(isString)) }) });
const isNews = objectOf<NewsNotification>({ ...notificationFields, kind: oneOf("news_digest"), payload: objectOf<NewsNotification["payload"]>({ topic_id: isString, topic: isString, scope: oneOf("personal", "work"), items: arrayOf(objectOf<NewsNotification["payload"]["items"][number]>({ title: isString, url: isHttpUrl, source: isString, published_at: nullable(isDateString) })) }) });
const isCalendarReminder = objectOf<CalendarReminderNotification>({ ...notificationFields, kind: oneOf("calendar_reminder"), payload: objectOf<CalendarReminderNotification["payload"]>({ event_id: isString, scope: oneOf("personal", "work"), title: isString, starts_at: isDateString, ends_at: nullable(isDateString), location: nullable(isString), remind_at: isDateString }) });
const isEventReminder = objectOf<EventReminderNotification>({ ...notificationFields, kind: oneOf("calendar_reminder"), payload: objectOf<EventReminderNotification["payload"]>({ reminder_id: isString, title: isString, remind_at: isDateString }) });
const isWorkflow = objectOf<WorkflowCheckinNotification>({ ...notificationFields, kind: oneOf("workflow_checkin"), payload: objectOf<WorkflowCheckinNotification["payload"]>({ workflow_id: isString, title: isString }) });
const isNotification: Guard<Notification> = (value): value is Notification => isNews(value) || isCalendarReminder(value) || isEventReminder(value) || isMemory(value) || isWorkflow(value);

async function request<T>(path: string, validate: Guard<T>, options: { method?: "GET" | "PATCH" | "POST"; body?: unknown; signal?: AbortSignal; onResponse?: (response: Response) => void } = {}) {
  const response = await fetch(`/api/notifications${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  const data: unknown = await response.json().catch(() => null);
  options.onResponse?.(response);
  if (!response.ok) {
    const detail = isRecord(data) && typeof data.detail === "string" ? data.detail : "";
    throw new NotificationsApiError(
      response.status,
      detail === "Notification not found"
        ? "Уведомление не найдено."
        : isRecord(data) && typeof data.message === "string"
          ? data.message
          : "Не удалось загрузить уведомления.",
    );
  }
  if (!validate(data)) throw new NotificationsApiError(502, "Сервис вернул некорректное уведомление.");
  return data;
}

export const getNotifications = (signal?: AbortSignal, status?: NotificationStatus, offset = 0) => {
  const params = new URLSearchParams({ limit: "100", offset: String(offset) });
  if (status) params.set("status", status);
  let unavailableCount = 0;
  return request(`?${params}`, arrayOf(isNotification), {
    signal,
    onResponse: (response) => { const count = Number(response.headers.get("X-Unavailable-Notifications") || 0); unavailableCount = Number.isSafeInteger(count) && count >= 0 ? count : 0; },
  }).then((items) => ({ items, unavailableCount }));
};

export const getUnreadNotificationCount = (signal?: AbortSignal) =>
  request("/unread-count", objectOf<{ count: number }>({ count: (value): value is number => isNumber(value) && Number.isSafeInteger(value) && value >= 0 }), { signal });

export const updateNotificationStatus = (id: string, status: NotificationStatus) =>
  request(`/${encodeURIComponent(id)}`, isNotification, { method: "PATCH", body: { status } });

export const confirmNotificationAction = (id: string) =>
  request(`/${encodeURIComponent(id)}/confirm`, objectOf<NotificationConfirmResponse>({ notification_id: isString, action_status: isString, created_event_id: nullable(isString), status: isString, action_type: isString, message: optional(isString) }), { method: "POST" });
