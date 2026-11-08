import type { DocumentRecord } from "@/lib/documents";
import { arrayOf, isBoolean, isHttpUrl, isNumber, isRecord, isString, objectOf, oneOf, optional } from "../../../lib/api-validation";
import type {
  DocumentInsights,
  DocumentViewModel,
  RelatedItem,
} from "../types";

const isCategory = oneOf("contracts", "finance", "reports", "work", "legal", "instructions", "presentations", "education", "research", "other");
const isImportance = oneOf("critical", "important", "normal", "unknown");
const isRelated = objectOf<RelatedItem>({ id: isString, type: oneOf("document", "chat", "memory", "calendar", "finance", "context"), title: isString, subtitle: optional(isString), href: optional((value): value is string => {
  if (typeof value !== "string") return false;
  try { return isHttpUrl(new URL(value, "https://workspace.invalid").href); } catch { return false; }
}) });

const sizeNumber = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export function extensionOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${sizeNumber.format(bytes)} Б`;
  if (bytes < 1024 * 1024) return `${sizeNumber.format(bytes / 1024)} КБ`;
  return `${sizeNumber.format(bytes / (1024 * 1024))} МБ`;
}

function fileType(document: Pick<DocumentRecord, "filename" | "mime_type">) {
  const extension = extensionOf(document.filename);
  if (extension) return extension.toUpperCase();
  return document.mime_type.split("/").at(-1)?.toUpperCase() || "Файл";
}

function asDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeDocument(document: DocumentRecord): DocumentViewModel {
  // Optional intelligence metadata is not part of the public document DTO.
  const raw: unknown = document;
  const future = isRecord(raw) ? raw : {};
  const rawInsights = future.insights;
  const isInsights = objectOf<{ obligations_count?: number; deadlines_count?: number; has_financial_terms?: boolean }>({ obligations_count: optional(isNumber), deadlines_count: optional(isNumber), has_financial_terms: optional(isBoolean) });
  const insights: DocumentInsights | null = isInsights(rawInsights)
    ? {
        obligationsCount: rawInsights.obligations_count,
        deadlinesCount: rawInsights.deadlines_count,
        hasFinancialTerms: rawInsights.has_financial_terms,
      }
    : null;

  return {
    source: document,
    id: document.id,
    filename: document.filename,
    fileType: fileType(document),
    fileSize: formatFileSize(document.file_size),
    scope: document.scope,
    status: document.status,
    pagesCount: document.pages_count,
    createdAt: asDate(document.created_at),
    availableAt: asDate(document.available_at),
    category: isCategory(future.category) ? future.category : null,
    importance: isImportance(future.importance) ? future.importance : "unknown",
    importanceReason: typeof future.importance_reason === "string" ? future.importance_reason : null,
    summary: typeof future.summary === "string" ? future.summary : null,
    insights,
    relatedItems: arrayOf(isRelated)(future.related_items) ? future.related_items : [],
  };
}
