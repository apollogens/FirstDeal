import { apiErrorMessage, arrayOf, isBoolean, isDateString, isNull, isNumber, isString, nullable, objectOf, optional, type Guard } from "./api-validation";

export type MailAccount = {
  id: string;
  provider: string;
  email: string;
  address?: string;
  external_account_id?: string | null;
  status: string;
};

export type MailMessageListItem = {
  id: string;
  account_id: string | null;
  delivery_status?: string;
  from_name: string | null;
  from_email: string;
  subject: string;
  preview: string;
  received_at: string;
  is_read: boolean;
};

export type MailMessage = MailMessageListItem & {
  body_text: string;
  to_recipients: { email: string; name?: string | null }[];
};

export type MailMessageList = { items: MailMessageListItem[]; total: number };

export type MailMessageParams = { accountId?: string; query?: string; isRead?: boolean; limit?: number; offset?: number };

export type MailSendPayload = { to: string[]; subject: string; body: string; account_id: string | null; in_reply_to_id?: string; idempotency_key: string };

type MailConnectUrl = {
  token: string;
  connect_link_url: string;
  expires_at: string;
};

export class MailApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const accountFields = { id: isString, provider: isString, email: isString, address: optional(isString), external_account_id: optional(nullable(isString)), status: isString };
const isAccount = objectOf<MailAccount>(accountFields);
const messageFields = { id: isString, account_id: nullable(isString), delivery_status: optional(isString), from_name: nullable(isString), from_email: isString, subject: isString, preview: isString, received_at: isDateString, is_read: isBoolean };
const isMessageItem = objectOf<MailMessageListItem>(messageFields);
const isMessage = objectOf<MailMessage>({ ...messageFields, body_text: isString, to_recipients: arrayOf(objectOf<MailMessage["to_recipients"][number]>({ email: isString, name: optional(nullable(isString)) })) });
const isConnect = objectOf<MailConnectUrl>({ token: isString, connect_link_url: isString, expires_at: isDateString });

async function request<T>(path: string, validate: Guard<T>, options: { method?: "GET" | "POST"; body?: object; signal?: AbortSignal } = {}) {
  const response = await fetch(`/api/mail${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: options.method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: options.method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
    signal: options.signal,
  });
  const data: unknown = response.status === 204 ? null : await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new MailApiError(
      response.status,
      apiErrorMessage(data, "Не удалось выполнить запрос. Попробуйте ещё раз.", "message"),
    );
  }
  if (!validate(data)) throw new MailApiError(502, "Сервис вернул некорректные данные почты.");
  return data;
}

export const getMailConnectUrl = (provider: "gmail" | "outlook") =>
  request(`/connect/${provider}`, isConnect);
export const syncMailAccounts = () => request("/accounts/sync", arrayOf(isAccount), { method: "POST" });
export const syncMailAccount = (id: string) => request(`/sync?account_id=${encodeURIComponent(id)}&limit=1`, objectOf<{ synced_messages_count: number; extracted_facts_count: number }>({ synced_messages_count: isNumber, extracted_facts_count: isNumber }), { method: "POST" });
export const getMailAccounts = (signal?: AbortSignal) => request("/accounts", arrayOf(isAccount), { signal });
export const disconnectMailAccount = async (id: string): Promise<void> => { await request(`/accounts/${encodeURIComponent(id)}/disconnect`, isNull, { method: "POST" }); };
export function getMailMessages(params: MailMessageParams, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (params.accountId) query.set("account_id", params.accountId);
  if (params.query) query.set("query", params.query);
  if (params.isRead !== undefined) query.set("is_read", String(params.isRead));
  query.set("limit", String(params.limit ?? 30));
  query.set("offset", String(params.offset ?? 0));
  return request(`/messages?${query}`, objectOf<MailMessageList>({ items: arrayOf(isMessageItem), total: isNumber }), { signal });
}
export const getMailMessage = (id: string, signal?: AbortSignal) => request(`/messages/${encodeURIComponent(id)}`, isMessage, { signal });
export const markMailMessageAsRead = (id: string) => request(`/messages/${encodeURIComponent(id)}/read`, isMessage, { method: "POST" });
export const sendMail = (payload: MailSendPayload) => request("/send", isMessage, { method: "POST", body: payload });
