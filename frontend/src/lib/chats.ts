import { arrayOf, isBoolean, isCurrencyCode, isDateString, isDecimalString, isIsoDate, isNumber, isRecord, isString, nullable, objectOf, oneOf, optional } from "./api-validation";
import type { Guard } from "./api-validation";

export type Chat = {
  id: string;
  user_id: string;
  context_id?: string | null;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessageRole = "user" | "assistant" | "system" | "tool";
export type ChatMessageAttachment = {
  document_id: string;
  filename: string;
  scope: "personal" | "work";
  status: "uploaded" | "processing" | "ready" | "error";
  pages_count: number | null;
  chunks_count: number;
};

export type ChatMessageCitation = {
  fact_id: string | null;
  evidence_id: string | null;
  source_type: string;
  source_id: string | null;
  fact_key: string | null;
  fact_value: string | null;
  confidence: number | null;
  valid_from: string | null;
  valid_to: string | null;
  observed_at: string | null;
};

export type ChatMessage = {
  id: string;
  chat_id: string;
  turn_id: string | null;
  sequence: number;
  role: ChatMessageRole;
  content: string;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: string;
  attachments?: ChatMessageAttachment[];
  citations?: ChatMessageCitation[];
  is_supported?: boolean;
};

export type ChatTurnStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type ChatTurn = {
  id: string;
  chat_id: string;
  client_request_id: string;
  status: ChatTurnStatus;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type ChatActionStatus = "pending" | "executed" | "rejected" | "expired";
export type ChatActionKind =
  | "create_calendar_event"
  | "update_calendar_event"
  | "delete_calendar_event"
  | "create_transaction"
  | "update_transaction"
  | "delete_transaction"
  | "create_finance_category"
  | "update_finance_category"
  | "delete_finance_category"
  | "create_tracked_topic"
  | "delete_tracked_topic"
  | "send_email";
export type CalendarActionPayload = {
  title: string;
  scope: "personal" | "work";
  description: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  remind_at: string | null;
};
export type TransactionActionPayload = {
  category_id: string;
  scope: "personal" | "work";
  amount: string;
  currency: string;
  type: "income" | "expense";
  date: string;
  description: string;
};
export type UpdateActionPayload<T> = {
  expected_updated_at: string;
  replacement: T;
} & ({ event_id: string } | { transaction_id: string });
export type DeleteActionPayload<T> = {
  expected_updated_at: string;
  snapshot: T;
} & ({ event_id: string } | { transaction_id: string } | { topic_id: string });
export type TrackedTopicActionPayload = {
  query: string;
  scope: "personal" | "work";
};
export type FinanceCategoryActionPayload = { name: string; type: "income" | "expense" };
export type FinanceCategoryUpdateActionPayload = {
  category_id: string;
  expected_updated_at: string;
  changes: { name?: string | null; type?: "income" | "expense" | null };
};
export type FinanceCategoryDeleteActionPayload = {
  category_id: string;
  expected_updated_at: string;
  snapshot: FinanceCategoryActionPayload;
};
export type EmailActionPayload = {
  to: string[];
  subject: string;
  body: string;
  account_id?: string | null;
  in_reply_to_id?: string | null;
};
type ChatActionMetadata = {
  id: string;
  chat_id: string;
  turn_id: string;
  status: ChatActionStatus;
  execution_status?: string | null;
  source_channel?: string | null;
  source_sender?: string | null;
  source_chat_title?: string | null;
  source_timestamp?: string | null;
  source_excerpt?: string | null;
  result_id: string | null;
  expires_at: string;
  resolved_at: string | null;
  created_at: string;
};

type ChatActionPayloads = {
  create_calendar_event: CalendarActionPayload;
  update_calendar_event: { event_id: string; expected_updated_at: string; replacement: CalendarActionPayload; snapshot?: CalendarActionPayload | null };
  delete_calendar_event: { event_id: string; expected_updated_at: string; snapshot: CalendarActionPayload };
  create_transaction: TransactionActionPayload;
  update_transaction: { transaction_id: string; expected_updated_at: string; replacement: TransactionActionPayload; snapshot?: TransactionActionPayload | null };
  delete_transaction: { transaction_id: string; expected_updated_at: string; snapshot: TransactionActionPayload };
  create_finance_category: FinanceCategoryActionPayload;
  update_finance_category: FinanceCategoryUpdateActionPayload & { snapshot?: FinanceCategoryActionPayload | null };
  delete_finance_category: FinanceCategoryDeleteActionPayload;
  create_tracked_topic: TrackedTopicActionPayload;
  delete_tracked_topic: { topic_id: string; expected_updated_at: string; snapshot: TrackedTopicActionPayload };
  send_email: EmailActionPayload;
};
export type ChatAction = {
  [K in ChatActionKind]: ChatActionMetadata & { kind: K; payload: ChatActionPayloads[K] };
}[ChatActionKind];

export class ChatsApiError extends Error {
  constructor(public status: number, message: string, public detail = "") {
    super(message);
  }
}

export type ChatSocketEvent = {
  event: "connected" | "pong" | "notification" | "turn_created" | "turn_started" | "turn_completed" | "turn_failed" | "turn_accepted" | "action_confirmed" | "action_done" | "action_failed" | "action_resolved" | "action_undone" | "telegram.connected" | "telegram.disconnected" | "telegram.memory.created" | "proposal.created" | "proposal.updated" | "action.completed" | "action.failed" | "error";
  data?: {
    turn_id?: string;
    action_id?: string;
    chat_id?: string;
    chat_type?: string;
    source_id?: string;
    status?: ChatTurnStatus | ChatActionStatus | "confirmed";
    error_code?: string;
  };
  error?: string;
};

const socketEventNames = {
  connected: true, pong: true, notification: true,
  turn_created: true, turn_started: true, turn_completed: true, turn_failed: true, turn_accepted: true,
  action_confirmed: true, action_done: true, action_failed: true, action_resolved: true, action_undone: true,
  "telegram.connected": true, "telegram.disconnected": true, "telegram.memory.created": true,
  "proposal.created": true, "proposal.updated": true,
  "action.completed": true, "action.failed": true, error: true,
} satisfies Record<ChatSocketEvent["event"], true>;

function isSocketEventName(value: unknown): value is ChatSocketEvent["event"] {
  return typeof value === "string" && Object.hasOwn(socketEventNames, value);
}

function isSocketData(value: unknown): value is NonNullable<ChatSocketEvent["data"]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const stringFields = ["turn_id", "action_id", "chat_id", "chat_type", "source_id", "error_code"] as const;
  if (!stringFields.every(key => !(key in value) || typeof Reflect.get(value, key) === "string")) return false;
  return !("status" in value) || value.status === "pending" || value.status === "running"
    || value.status === "completed" || value.status === "failed" || value.status === "cancelled"
    || value.status === "executed" || value.status === "rejected" || value.status === "expired" || value.status === "confirmed";
}

export function parseChatSocketEvent(frame: unknown): ChatSocketEvent | null {
  if (typeof frame !== "string") return null;
  let value: unknown;
  try { value = JSON.parse(frame); } catch { return null; }
  if (typeof value !== "object" || value === null || !("event" in value) || !isSocketEventName(value.event)) return null;
  const event: ChatSocketEvent = { event: value.event };
  if ("data" in value) {
    if (!isSocketData(value.data)) return null;
    event.data = value.data;
  }
  if ("error" in value) {
    if (typeof value.error !== "string") return null;
    event.error = value.error;
  }
  return event;
}

async function socketCredentials(): Promise<{ baseUrl: string; token: string }> {
  const response = await fetch("/api/auth/socket", { credentials: "same-origin", cache: "no-store" });
  const data: unknown = await response.json().catch(() => null);
  const record = typeof data === "object" && data !== null ? data : {};
  if (!response.ok) {
    throw new ChatsApiError(response.status, "message" in record && typeof record.message === "string" ? record.message : "Не удалось подключить обновления.");
  }
  if (!("baseUrl" in record) || typeof record.baseUrl !== "string" || !("token" in record) || typeof record.token !== "string") {
    throw new ChatsApiError(502, "Сервис вернул некорректные данные подключения.");
  }
  return { baseUrl: record.baseUrl, token: record.token };
}

export async function connectChatSocket(chatId: string, onEvent: (event: ChatSocketEvent) => void) {
  const data = await socketCredentials();
  const socket = new WebSocket(`${data.baseUrl}/chats/${encodeURIComponent(chatId)}/ws`);
  socket.addEventListener("open", () => socket.send(JSON.stringify({ action: "auth", token: data.token })));
  socket.addEventListener("message", (message) => {
    const event = parseChatSocketEvent(message.data);
    if (event) onEvent(event);
  });
  return socket;
}

export async function connectUserSocket(onEvent: (event: ChatSocketEvent) => void) {
  const data = await socketCredentials();
  const socket = new WebSocket(`${data.baseUrl}/ws`);
  socket.addEventListener("open", () => socket.send(JSON.stringify({ action: "auth", token: data.token })));
  socket.addEventListener("message", (message) => {
    const event = parseChatSocketEvent(message.data);
    if (event) onEvent(event);
  });
  return socket;
}

const messages: Record<string, string> = {
  "Chat not found": "Диалог не найден.",
  "Chat already has an active turn": "Дождитесь завершения текущего запроса.",
  "Request ID was already used with different content": "Не удалось повторно отправить запрос.",
  "Chat or turn not found": "Диалог или запрос не найден.",
  "Only pending turns can be cancelled": "Этот запрос уже нельзя отменить.",
  "Chat or action not found": "Диалог или действие не найдено.",
  "User is inactive": "Пользователь неактивен.",
  "Action already resolved": "Это действие уже обработано.",
  "Action expired; request a new proposal": "Срок подтверждения истёк. Попросите агента подготовить действие заново.",
  "Source generation has not completed successfully": "Ответ агента ещё не завершён. Повторите попытку позже.",
  "One or more attached documents were not found": "Один или несколько документов недоступны.",
  "One or more attached documents are still processing": "Документ ещё обрабатывается. Дождитесь завершения и повторите отправку.",
  "Target transaction no longer exists": "Финансовая операция больше не существует.",
  "Target calendar event no longer exists": "Событие календаря больше не существует.",
  "Tracked topic no longer exists": "Отслеживаемая тема больше не существует.",
  "Topic is already tracked": "Эта тема уже отслеживается.",
  "Category is unavailable or has a different type": "Категория недоступна или не соответствует типу операции.",
  "Message saved, but generation queue is unavailable. Retry with the same client_request_id.":
    "Сообщение сохранено, но очередь генерации временно недоступна. Повторите отправку — идентификатор запроса сохранён.",
};

const isInteger: Guard<number> = (value): value is number => isNumber(value) && Number.isInteger(value);
const isScope = oneOf("personal", "work");
const isFinanceType = oneOf("income", "expense");
const isChat = objectOf<Chat>({
  id: isString, user_id: isString, context_id: optional(nullable(isString)), title: isString,
  created_at: isDateString, updated_at: isDateString,
});
const isAttachment = objectOf<ChatMessageAttachment>({
  document_id: isString, filename: isString, scope: isScope,
  status: oneOf("uploaded", "processing", "ready", "error"), pages_count: nullable(isInteger), chunks_count: isInteger,
});
const isCitation = objectOf<ChatMessageCitation>({
  fact_id: nullable(isString), evidence_id: nullable(isString), source_type: isString,
  source_id: nullable(isString), fact_key: nullable(isString), fact_value: nullable(isString),
  confidence: nullable(isNumber), valid_from: nullable(isDateString), valid_to: nullable(isDateString), observed_at: nullable(isDateString),
});
const isChatMessage = objectOf<ChatMessage>({
  id: isString, chat_id: isString, turn_id: nullable(isString), sequence: isInteger,
  role: oneOf("user", "assistant", "system", "tool"), content: isString, model: nullable(isString),
  prompt_tokens: nullable(isInteger), completion_tokens: nullable(isInteger), created_at: isDateString,
  attachments: optional(arrayOf(isAttachment)), citations: optional(arrayOf(isCitation)), is_supported: optional(isBoolean),
});
const isChatTurn = objectOf<ChatTurn>({
  id: isString, chat_id: isString, client_request_id: isString,
  status: oneOf("pending", "running", "completed", "failed", "cancelled"), error_code: nullable(isString),
  created_at: isDateString, updated_at: isDateString, completed_at: nullable(isDateString),
});
const isCalendarPayload = objectOf<CalendarActionPayload>({
  title: isString, scope: isScope, description: isString, starts_at: isDateString,
  ends_at: nullable(isDateString), location: nullable(isString), remind_at: nullable(isDateString),
});
const isTransactionPayload = objectOf<TransactionActionPayload>({
  category_id: isString, scope: isScope, amount: isDecimalString, currency: isCurrencyCode, type: isFinanceType,
  date: isIsoDate, description: isString,
});
const isCategoryPayload = objectOf<FinanceCategoryActionPayload>({ name: isString, type: isFinanceType });
const isCategoryChanges = objectOf<FinanceCategoryUpdateActionPayload["changes"]>({ name: optional(nullable(isString)), type: optional(nullable(isFinanceType)) });
const isTopicPayload = objectOf<TrackedTopicActionPayload>({ query: isString, scope: isScope });
const isEmailPayload = objectOf<EmailActionPayload>({
  to: arrayOf(isString), subject: isString, body: isString,
  account_id: optional(nullable(isString)), in_reply_to_id: optional(nullable(isString)),
});

function isMutationPayload<T>(value: unknown, id: "event_id" | "transaction_id" | "topic_id", key: "replacement" | "snapshot", guard: Guard<T>): boolean {
  return isRecord(value) && isString(value[id]) && isDateString(value.expected_updated_at) && guard(value[key]) &&
    (key !== "replacement" || value.snapshot === undefined || value.snapshot === null || guard(value.snapshot));
}

export function isChatAction(value: unknown): value is ChatAction {
  if (!isRecord(value) ||
    !["id", "chat_id", "turn_id"].every(key => isString(value[key])) ||
    !oneOf("pending", "executed", "rejected", "expired")(value.status) ||
    !["execution_status", "source_channel", "source_sender", "source_chat_title", "source_excerpt"].every(key => optional(nullable(isString))(value[key])) ||
    !optional(nullable(isDateString))(value.source_timestamp) ||
    !nullable(isString)(value.result_id) || !isDateString(value.expires_at) ||
    !nullable(isDateString)(value.resolved_at) || !isDateString(value.created_at)) return false;
  const payload = value.payload;
  // The kind determines the payload contract; a structurally valid payload for another action is rejected.
  switch (value.kind) {
    case "create_calendar_event": return isCalendarPayload(payload);
    case "update_calendar_event": return isMutationPayload(payload, "event_id", "replacement", isCalendarPayload);
    case "delete_calendar_event": return isMutationPayload(payload, "event_id", "snapshot", isCalendarPayload);
    case "create_transaction": return isTransactionPayload(payload);
    case "update_transaction": return isMutationPayload(payload, "transaction_id", "replacement", isTransactionPayload);
    case "delete_transaction": return isMutationPayload(payload, "transaction_id", "snapshot", isTransactionPayload);
    case "create_finance_category": return isCategoryPayload(payload);
    case "update_finance_category":
      return isRecord(payload) && isString(payload.category_id) && isDateString(payload.expected_updated_at) &&
        isCategoryChanges(payload.changes) && (typeof payload.changes.name === "string" || typeof payload.changes.type === "string") &&
        (payload.snapshot === undefined || payload.snapshot === null || isCategoryPayload(payload.snapshot));
    case "delete_finance_category":
      return isRecord(payload) && isString(payload.category_id) && isDateString(payload.expected_updated_at) && isCategoryPayload(payload.snapshot);
    case "create_tracked_topic": return isTopicPayload(payload);
    case "delete_tracked_topic": return isMutationPayload(payload, "topic_id", "snapshot", isTopicPayload);
    case "send_email": return isEmailPayload(payload) && payload.to.length > 0;
    default: return false;
  }
}

const isMessagesPage = objectOf<{ items: ChatMessage[]; next_before_sequence: number | null }>({
  items: arrayOf(isChatMessage), next_before_sequence: nullable(isInteger),
});
const isAcceptedTurn = objectOf<{ turn: ChatTurn; message: ChatMessage }>({ turn: isChatTurn, message: isChatMessage });

async function request<T>(path: string, guard: Guard<T>, options: { method?: "GET" | "POST" | "PATCH"; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`/api/chats${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = typeof data === "object" && data !== null ? data : {};
    const detail = "detail" in error && typeof error.detail === "string" ? error.detail : "";
    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    throw new ChatsApiError(
      response.status,
      messages[detail] ?? (message || "Не удалось выполнить запрос. Попробуйте ещё раз."),
      detail,
    );
  }
  if (!guard(data)) throw new ChatsApiError(502, "Сервис вернул некорректные данные диалога.");
  return data;
}

let chatsFlight: Promise<Chat[]> | null = null;

export const getChats = (signal?: AbortSignal) => {
  if (signal?.aborted) return Promise.reject(new DOMException("Запрос отменён", "AbortError"));
  if (!chatsFlight) {
    const current = request<Chat[]>("?limit=100&offset=0", arrayOf(isChat));
    chatsFlight = current;
    const release = () => window.setTimeout(() => {
      if (chatsFlight === current) chatsFlight = null;
    }, 1_500);
    current.then(release, release);
  }
  return chatsFlight;
};
export const createChat = (title = "Новый чат") => request<Chat>("", isChat, { method: "POST", body: { title } });
export const getChat = (chatId: string, signal?: AbortSignal) =>
  request<Chat>(`/${encodeURIComponent(chatId)}`, isChat, { signal });
export const updateChat = async (chatId: string, title: string) => {
  const chat = await request<Chat>(`/${encodeURIComponent(chatId)}`, isChat, { method: "PATCH", body: { title } });
  chatsFlight = null;
  return chat;
};
export const getChatMessages = (
  chatId: string,
  signal?: AbortSignal,
  beforeSequence?: number | null,
  limit = 100,
) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeSequence) params.set("before_sequence", String(beforeSequence));
  return request<{ items: ChatMessage[]; next_before_sequence: number | null }>(
    `/${encodeURIComponent(chatId)}/messages?${params}`, isMessagesPage,
    { signal },
  );
};
export const sendChatMessage = (chatId: string, content: string, clientRequestId = crypto.randomUUID(), documentIds: string[] = []) =>
  request<{ turn: ChatTurn; message: ChatMessage }>(`/${encodeURIComponent(chatId)}/turns`, isAcceptedTurn, {
    method: "POST",
    body: { client_request_id: clientRequestId, content, document_ids: documentIds },
  });
export const getChatTurn = (chatId: string, turnId: string, signal?: AbortSignal) =>
  request<ChatTurn>(`/${encodeURIComponent(chatId)}/turns/${encodeURIComponent(turnId)}`, isChatTurn, { signal });
export const cancelChatTurn = (chatId: string, turnId: string) =>
  request<ChatTurn>(`/${encodeURIComponent(chatId)}/turns/${encodeURIComponent(turnId)}/cancel`, isChatTurn, { method: "POST", body: {} });
export const getChatActions = (chatId: string, signal?: AbortSignal, turnId?: string) => {
  const params = new URLSearchParams({ limit: "100", offset: "0" });
  if (turnId) params.set("turn_id", turnId);
  return request<ChatAction[]>(`/${encodeURIComponent(chatId)}/actions?${params}`, arrayOf(isChatAction), { signal });
};
export const confirmChatAction = (chatId: string, actionId: string) =>
  request<ChatAction>(`/${encodeURIComponent(chatId)}/actions/${encodeURIComponent(actionId)}/confirm`, isChatAction, { method: "POST", body: {} });
export const rejectChatAction = (chatId: string, actionId: string) =>
  request<ChatAction>(`/${encodeURIComponent(chatId)}/actions/${encodeURIComponent(actionId)}/reject`, isChatAction, { method: "POST", body: {} });
