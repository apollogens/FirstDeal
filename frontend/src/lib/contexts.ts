import type { Chat } from "@/lib/chats";
import { apiErrorMessage, arrayOf, isDateString, isRecord, isString, nullable, objectOf, oneOf, optional, type Guard } from "./api-validation";

export type ContextSourceType = "chat" | "email" | "document" | "calendar" | "finance";
export type ContextItemSourceType = "chat_message" | "email" | "document" | "calendar_event" | "transaction";
export type ContextItem = { source_type: ContextItemSourceType; source_id: string; occurred_at: string };
export type ContextBundle = {
  id: string;
  title: string;
  date_from: string;
  date_to: string;
  items: ContextItem[];
  created_at: string;
  updated_at: string;
};
export type ContextBuildPayload = { title?: string; date_from: string; date_to: string; source_types?: ContextSourceType[] };
export type ContextChat = { chat: Chat; context: ContextBundle };

export class ContextsApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const isContextItem = objectOf<ContextItem>({ source_type: oneOf("chat_message", "email", "document", "calendar_event", "transaction"), source_id: isString, occurred_at: isDateString });
const isContext = objectOf<ContextBundle>({ id: isString, title: isString, date_from: isDateString, date_to: isDateString, items: arrayOf(isContextItem), created_at: isDateString, updated_at: isDateString });
const isContextChat = objectOf<ContextChat>({
  chat: objectOf<Chat>({ id: isString, user_id: isString, context_id: optional(nullable(isString)), title: isString, created_at: isDateString, updated_at: isDateString }),
  context: isContext,
});

async function request<T>(path: string, validate: Guard<T>, options: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {}) {
  const response = await fetch(`/api/contexts${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const issues: unknown = isRecord(data) ? data.detail : undefined;
    const validation = Array.isArray(issues) ? issues.filter(isRecord).map(issue => {
      const location = Array.isArray(issue.loc) ? issue.loc.filter((part: unknown) => typeof part === "string" || typeof part === "number").join(".") : "";
      return `${location ? location + ": " : ""}${typeof issue.msg === "string" ? issue.msg : "Ошибка проверки"}`;
    }).join("; ") : "";
    throw new ContextsApiError(
      response.status,
      validation || apiErrorMessage(data, "Не удалось выполнить запрос к контекстам."),
    );
  }
  if (!validate(data)) throw new ContextsApiError(502, "Сервис вернул некорректные данные контекста.");
  return data;
}

export const getContexts = (signal?: AbortSignal, limit = 100, offset = 0) => request(`?limit=${limit}&offset=${offset}`, arrayOf(isContext), { signal });
export const getContext = (id: string, signal?: AbortSignal) => request(`/${encodeURIComponent(id)}`, isContext, { signal });
export const createContext = (body: ContextBuildPayload) => request("", isContext, { method: "POST", body });
export const createContextChat = (id: string, title = "Чат по контексту") => request(`/${encodeURIComponent(id)}/chat`, isContextChat, { method: "POST", body: { title } });
