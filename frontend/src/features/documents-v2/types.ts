import type { DocumentRecord, DocumentScope, DocumentStatus } from "@/lib/documents";

export type DocumentCategory =
  | "contracts"
  | "finance"
  | "reports"
  | "work"
  | "legal"
  | "instructions"
  | "presentations"
  | "education"
  | "research"
  | "other";

export type DocumentImportance = "critical" | "important" | "normal" | "unknown";

export type RelatedItem = {
  id: string;
  type: "document" | "chat" | "memory" | "calendar" | "finance" | "context";
  title: string;
  subtitle?: string;
  href?: string;
};

export type DocumentInsights = {
  obligationsCount?: number;
  deadlinesCount?: number;
  hasFinancialTerms?: boolean;
};

export type DocumentViewModel = {
  source: DocumentRecord;
  id: string;
  filename: string;
  fileType: string;
  fileSize: string;
  scope: DocumentScope;
  status: DocumentStatus;
  pagesCount: number | null;
  createdAt: Date | null;
  availableAt: Date | null;
  category: DocumentCategory | null;
  importance: DocumentImportance;
  importanceReason: string | null;
  summary: string | null;
  insights: DocumentInsights | null;
  relatedItems: RelatedItem[];
};
