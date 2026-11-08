export type DocumentScope = "personal" | "work";
export type KnownDocumentStatus = "uploaded" | "processing" | "ready" | "error";
export type DocumentStatus = KnownDocumentStatus | (string & {});

export const DOCUMENT_FILE_ACCEPT = ".pdf,.doc,.docx,.xlsx,.png,.jpg,.jpeg,.webp";
export const DOCUMENT_MAX_FILE_SIZE = 52_428_800;

export type DocumentRecord = {
  id: string;
  user_id: string;
  scope: DocumentScope;
  filename: string;
  file_size: number;
  mime_type: string;
  status: DocumentStatus;
  error_message: string | null;
  pages_count: number | null;
  chunks_count: number;
  available_at: string | null;
  content_hash: string | null;
  source_group_id: string | null;
  version: number | null;
  supersedes_document_id: string | null;
  memory_status: string | null;
  memory_attempt_count: number | null;
  memory_processed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentSearchResult = {
  chunk_id: string;
  document_id: string;
  filename: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
  score: number;
};

export class DocumentsApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const responseMessages: Record<number, string> = {
  401: "Сессия истекла. Войдите снова.",
  413: "Файл превышает максимальный размер 50 МБ.",
  415: "Формат файла не поддерживается.",
  422: "Не удалось обработать файл. Проверьте, что файл не повреждён и соответствует выбранному формату.",
};

const detailMessages: Record<string, string> = {
  "Document not found": "Документ не найден или больше недоступен.",
  "Document file not found": "Файл документа не найден.",
  "Document search is temporarily unavailable": "Поиск по документам временно недоступен.",
};

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

function isDocument(value: unknown): value is DocumentRecord {
  return isRecord(value) &&
    ["id", "user_id", "filename", "mime_type", "status", "created_at", "updated_at"].every(key => typeof value[key] === "string") &&
    (value.scope === "personal" || value.scope === "work") &&
    ["file_size", "chunks_count"].every(key => typeof value[key] === "number" && Number.isInteger(value[key])) &&
    ["pages_count", "version", "memory_attempt_count"].every(key => value[key] === null || (typeof value[key] === "number" && Number.isInteger(value[key]))) &&
    ["error_message", "available_at", "content_hash", "source_group_id", "supersedes_document_id", "memory_status", "memory_processed_at"].every(key => isNullableString(value[key]));
}

function isDocumentSearchResult(value: unknown): value is DocumentSearchResult {
  return isRecord(value) &&
    ["chunk_id", "document_id", "filename", "content"].every(key => typeof value[key] === "string") &&
    typeof value.chunk_index === "number" && Number.isInteger(value.chunk_index) &&
    (value.page_number === null || (typeof value.page_number === "number" && Number.isInteger(value.page_number))) &&
    typeof value.score === "number" && Number.isFinite(value.score) && value.score >= -1 && value.score <= 1;
}

async function request<T>(
  path: string,
  guard: (value: unknown) => value is T,
  options: { method?: "GET" | "POST" | "DELETE"; body?: FormData | object; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api/documents${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: options.body && !(options.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : undefined,
    body: options.body instanceof FormData
      ? options.body
      : options.body
        ? JSON.stringify(options.body)
        : undefined,
    signal: options.signal,
  });
  const data: unknown = await response.json().catch(() => null);
  const error = isRecord(data) ? data : {};
  if (!response.ok) {
    throw new DocumentsApiError(
      response.status,
      responseMessages[response.status] ??
        (typeof error.detail === "string"
          ? detailMessages[error.detail] ?? error.detail
          : typeof error.message === "string"
            ? error.message
          : "Не удалось выполнить запрос. Попробуйте ещё раз."),
    );
  }
  if (!guard(data)) throw new DocumentsApiError(response.status, "Некорректный ответ сервера.");
  return data;
}

export function getDocuments(scope: DocumentScope | "", signal?: AbortSignal, status?: KnownDocumentStatus) {
  const params = new URLSearchParams({ limit: "100", offset: "0" });
  if (scope) params.set("scope", scope);
  if (status) params.set("status", status);
  return request<DocumentRecord[]>(`?${params}`, arrayOf(isDocument), { signal });
}

export function getDocument(id: string, signal?: AbortSignal) {
  return request<DocumentRecord>(`/${encodeURIComponent(id)}`, isDocument, { signal });
}

export function uploadDocument(file: File, scope: DocumentScope, replacesDocumentId?: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("scope", scope);
  if (replacesDocumentId) formData.append("replaces_document_id", replacesDocumentId);
  return request<DocumentRecord>("", isDocument, { method: "POST", body: formData });
}

export async function deleteDocument(id: string): Promise<void> {
  await request<null>(`/${encodeURIComponent(id)}`, isNull, { method: "DELETE" });
}

export function searchDocuments(query: string, scope: DocumentScope | "", signal?: AbortSignal) {
  return request<DocumentSearchResult[]>("/search", arrayOf(isDocumentSearchResult), {
    method: "POST",
    body: { query, ...(scope ? { scope } : {}), limit: 10 },
    signal,
  });
}

export function documentDownloadUrl(id: string) {
  return `/api/documents/${encodeURIComponent(id)}/download`;
}

export function documentPreviewUrl(id: string) {
  return `${documentDownloadUrl(id)}?preview=1`;
}
