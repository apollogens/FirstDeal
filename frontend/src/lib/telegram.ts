import { apiErrorMessage, arrayOf, isBoolean, isDateString, isRecord, isString, nullable, objectOf, optional } from "./api-validation";

export type TelegramGroup = { chat_id: string; title: string };

export type TelegramConnection = {
  connected: boolean;
  username: string | null;
  last_seen: string | null;
  bot_url: string | null;
  groups: TelegramGroup[];
};

function normalizeConnection(data: Partial<TelegramConnection> | null): TelegramConnection {
  const groups = Array.isArray(data?.groups)
    ? data.groups
        .filter((group): group is TelegramGroup => Boolean(group && typeof group === "object" && group.chat_id))
        .map((group) => ({
          chat_id: String(group.chat_id),
          title: typeof group.title === "string" && group.title.trim() ? group.title : "Рабочая группа",
        }))
    : [];
  return {
    connected: Boolean(data?.connected),
    username: typeof data?.username === "string" ? data.username : null,
    last_seen: typeof data?.last_seen === "string" ? data.last_seen : null,
    bot_url: typeof data?.bot_url === "string" ? data.bot_url : null,
    groups,
  };
}

async function telegramRequest(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/telegram/${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(apiErrorMessage(data, "Не удалось выполнить запрос к Telegram."));
  }
  return data;
}

export const getTelegramConnection = async (signal?: AbortSignal) => {
  const data = await telegramRequest("connection", { signal });
  const validate = objectOf<TelegramConnection>({ connected: isBoolean, username: nullable(isString), last_seen: nullable(isDateString), bot_url: nullable(isString), groups: arrayOf(objectOf<TelegramGroup>({ chat_id: isString, title: isString })) });
  if (!validate(data)) throw new Error("Сервис вернул некорректное подключение Telegram.");
  return normalizeConnection(data);
};

export async function createTelegramLink(purpose: "private" | "group"): Promise<string> {
  const result = await telegramRequest(purpose === "group" ? "group-link" : "link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose }),
  });
  const validate = objectOf<{ deep_link?: string; url?: string }>({ deep_link: optional(isString), url: optional(isString) });
  if (!validate(result)) throw new Error("Некорректная ссылка Telegram.");
  const url = new URL(result.deep_link || result.url || "");
  if (url.protocol !== "https:" || url.hostname !== "t.me") throw new Error("Некорректная ссылка Telegram.");
  return url.toString();
}

export const disconnectTelegram = async (): Promise<{ connected: false }> => {
  const data = await telegramRequest("connection", { method: "DELETE" });
  if (!isRecord(data) || data.connected !== false) throw new Error("Сервис не подтвердил отключение Telegram.");
  return { connected: false };
};
