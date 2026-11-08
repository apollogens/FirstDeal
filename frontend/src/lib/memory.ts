import { isChatAction } from "./chats";
import { apiErrorMessage, arrayOf, isDateString, isNull, isNumber, isRecord, isString, isUnknown, nullable, objectOf, oneOf, type Guard } from "./api-validation";

export type MemoryScope = "personal" | "work";
export type MemoryFactStatus = "candidate" | "active" | "superseded" | "retracted" | "conflicted";
export type MemoryAttentionStatus = "open" | "resolved" | "dismissed";
export type MemoryAttentionSeverity = "low" | "medium" | "high" | "critical";
export type MemorySourceType = "chat_message" | "telegram_message" | "document" | "calendar_event" | "transaction" | "manual" | "dataset_item" | "email";

export type MemoryEvidence = {
  id: string;
  source_type: MemorySourceType;
  source_id: string;
  source_version: number | null;
  observed_at: string;
  evidence_text: string;
  evidence_location: Record<string, unknown>;
};

export type MemoryFact = {
  id: string;
  scope: MemoryScope;
  subject_type: string;
  subject: string;
  fact_type: string;
  predicate: string;
  value: unknown;
  status: MemoryFactStatus;
  confidence: number;
  valid_from: string | null;
  valid_to: string | null;
  supersedes_fact_id: string | null;
  last_observed_at: string;
  evidence: MemoryEvidence[];
};

export type MemoryDecision = {
  id: string;
  scope: MemoryScope;
  decision_type: string;
  decision_key: string;
  payload: Record<string, unknown>;
  status: "valid" | "stale";
  dependency_fact_ids: string[];
  updated_at: string;
};

export type MemoryAttention = {
  id: string;
  decision_id: string;
  severity: MemoryAttentionSeverity;
  score: number;
  reason: string;
  status: MemoryAttentionStatus;
  created_at: string;
  resolved_at: string | null;
};

export class MemoryApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const isEvidence = objectOf<MemoryEvidence>({ id: isString, source_type: oneOf("chat_message", "telegram_message", "document", "calendar_event", "transaction", "manual", "dataset_item", "email"), source_id: isString, source_version: nullable(isNumber), observed_at: isDateString, evidence_text: isString, evidence_location: isRecord });
const isFact = objectOf<MemoryFact>({ id: isString, scope: oneOf("personal", "work"), subject_type: isString, subject: isString, fact_type: isString, predicate: isString, value: isUnknown, status: oneOf("candidate", "active", "superseded", "retracted", "conflicted"), confidence: isNumber, valid_from: nullable(isDateString), valid_to: nullable(isDateString), supersedes_fact_id: nullable(isString), last_observed_at: isDateString, evidence: arrayOf(isEvidence) });
const isDecision = objectOf<MemoryDecision>({ id: isString, scope: oneOf("personal", "work"), decision_type: isString, decision_key: isString, payload: isRecord, status: oneOf("valid", "stale"), dependency_fact_ids: arrayOf(isString), updated_at: isDateString });
const isAttention = objectOf<MemoryAttention>({ id: isString, decision_id: isString, severity: oneOf("low", "medium", "high", "critical"), score: isNumber, reason: isString, status: oneOf("open", "resolved", "dismissed"), created_at: isDateString, resolved_at: nullable(isDateString) });

async function request<T>(path: string, validate: Guard<T>, options: { method?: "GET" | "POST" | "PATCH"; body?: unknown; signal?: AbortSignal } = {}) {
  const response = await fetch(`/api/memory${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  const data: unknown = response.status === 204 ? null : await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new MemoryApiError(
      response.status,
      apiErrorMessage(data, "Не удалось выполнить запрос к памяти."),
    );
  }
  if (!validate(data)) throw new MemoryApiError(502, "Сервис вернул некорректные данные памяти.");
  return data;
}

export function getMemoryFacts(status?: MemoryFactStatus, signal?: AbortSignal, limit = 100, offset = 0, sourceType?: "telegram_message") {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (status) params.set("status", status);
  if (sourceType) params.set("source_type", sourceType);
  return request(`/facts?${params}`, arrayOf(isFact), { signal });
}
export const getMemoryFact = (id: string, signal?: AbortSignal) => request(`/facts/${encodeURIComponent(id)}`, isFact, { signal });
export const getMemoryFactHistory = (id: string, signal?: AbortSignal) => request(`/facts/${encodeURIComponent(id)}/history`, arrayOf(isFact), { signal });
export const getMemoryFactDependencies = (id: string, signal?: AbortSignal) => request(`/facts/${encodeURIComponent(id)}/dependencies`, arrayOf(isDecision), { signal });
export const archiveMemoryFact = async (id: string): Promise<void> => { await request(`/facts/${encodeURIComponent(id)}/archive`, isNull, { method: "POST" }); };
export const resolveMemoryConflict = async (id: string, selectedFactId: string): Promise<void> => { await request(`/facts/${encodeURIComponent(id)}/resolve-conflict`, isNull, { method: "POST", body: { selected_fact_id: selectedFactId } }); };
export const getMemoryAttention = (status: MemoryAttentionStatus | undefined = "open", signal?: AbortSignal) => request(`/attention${status ? `?status=${encodeURIComponent(status)}` : ""}`, arrayOf(isAttention), { signal });
export const updateMemoryAttention = (id: string, status: MemoryAttentionStatus) => request(`/attention/${encodeURIComponent(id)}`, isAttention, { method: "PATCH", body: { status } });
export const createAttentionCalendarProposal = (id: string, body: { chat_id: string; title?: string; reminder_before_minutes?: number }) => request(`/attention/${encodeURIComponent(id)}/calendar-proposal`, isChatAction, { method: "POST", body });
export const getMemoryDecision = (id: string, signal?: AbortSignal) => request(`/decisions/${encodeURIComponent(id)}`, isDecision, { signal });
