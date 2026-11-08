import { apiErrorMessage, arrayOf, isBoolean, isDateString, isNumber, isRecord, isString, isUnknown, nullable, objectOf, optional, type Guard } from "./api-validation";

export type DatasetSourceType = "email" | "telegram" | "calendar" | "mixed_jsonl";

export type Dataset = {
  id: string;
  name: string;
  source_type: string;
  status: string;
  items_count: number;
  error_message: string | null;
  created_at: string;
};

export type RejectedLine = {
  line_number: number;
  reason: string;
  sample?: string | null;
};

export type DatasetImportResult = {
  dataset_id: string;
  name: string;
  source_type: string;
  items_imported: number;
  facts_extracted: number;
  status: string;
  rejected_lines?: RejectedLine[];
};

export type FactProvenanceExport = {
  evidence_id: string;
  source_type: string;
  source_id?: string | null;
  observed_at: string;
  evidence_text: string;
  evidence_location?: Record<string, unknown> | null;
};

export type ProfileFactExport = {
  fact_id: string;
  scope: string;
  subject_type: string;
  subject: string;
  fact_key: string;
  fact_type: string;
  value: unknown;
  confidence: number;
  is_explicit?: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
  last_observed_at: string;
  provenance: FactProvenanceExport[];
};

export type ProfileExportResponse = {
  user_id: string;
  generated_at: string;
  active_facts_count: number;
  facts: ProfileFactExport[];
};

export type ResetResult = {
  datasets_deleted: number;
  dataset_items_deleted: number;
  facts_deleted: number;
  calendar_events_deleted: number;
  evidence_deleted: number;
};

export type BenchmarkReport = {
  total: number;
  passed: number;
  score_percentage: number;
  items: Array<{ question: string; expected: string[]; actual: string; passed: boolean }>;
};

export class DatasetsApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const isDataset = objectOf<Dataset>({ id: isString, name: isString, source_type: isString, status: isString, items_count: isNumber, error_message: nullable(isString), created_at: isDateString });
const isRejectedLine = objectOf<RejectedLine>({ line_number: isNumber, reason: isString, sample: optional(nullable(isString)) });
const isImport = objectOf<DatasetImportResult>({ dataset_id: isString, name: isString, source_type: isString, items_imported: isNumber, facts_extracted: isNumber, status: isString, rejected_lines: optional(arrayOf(isRejectedLine)) });
const isProvenance = objectOf<FactProvenanceExport>({ evidence_id: isString, source_type: isString, source_id: optional(nullable(isString)), observed_at: isDateString, evidence_text: isString, evidence_location: optional(nullable(isRecord)) });
const isFact = objectOf<ProfileFactExport>({ fact_id: isString, scope: isString, subject_type: isString, subject: isString, fact_key: isString, fact_type: isString, value: isUnknown, confidence: isNumber, is_explicit: optional(isBoolean), valid_from: optional(nullable(isDateString)), valid_to: optional(nullable(isDateString)), last_observed_at: isDateString, provenance: arrayOf(isProvenance) });
const isExport = objectOf<ProfileExportResponse>({ user_id: isString, generated_at: isDateString, active_facts_count: isNumber, facts: arrayOf(isFact) });
const isReset = objectOf<ResetResult>({ datasets_deleted: isNumber, dataset_items_deleted: isNumber, facts_deleted: isNumber, calendar_events_deleted: isNumber, evidence_deleted: isNumber });
const isBenchmark = objectOf<BenchmarkReport>({ total: isNumber, passed: isNumber, score_percentage: isNumber, items: arrayOf(objectOf<BenchmarkReport["items"][number]>({ question: isString, expected: arrayOf(isString), actual: isString, passed: isBoolean })) });

async function responseData<T>(response: Response, validate: Guard<T>): Promise<T> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new DatasetsApiError(
      response.status,
      apiErrorMessage(data, "Не удалось выполнить запрос к наборам данных."),
    );
  }
  if (!validate(data)) throw new DatasetsApiError(502, "Сервис вернул некорректные данные набора.");
  return data;
}

export async function getDatasets(signal?: AbortSignal) {
  return responseData(await fetch("/api/datasets", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  }), arrayOf(isDataset));
}

export async function uploadDataset(file: File, sourceType: DatasetSourceType) {
  const body = new FormData();
  body.append("name", file.name);
  body.append("source_type", sourceType);
  body.append("file", file);
  return responseData(await fetch("/api/datasets/upload", {
    method: "POST",
    credentials: "same-origin",
    body,
  }), isImport);
}

export async function runDatasetBenchmark() {
  return responseData(await fetch("/api/datasets/benchmark", {
    method: "POST",
    credentials: "same-origin",
  }), isBenchmark);
}

export async function resetDatasets() {
  return responseData(await fetch("/api/datasets/reset", {
    method: "POST",
    credentials: "same-origin",
  }), isReset);
}

export async function exportProfile() {
  return responseData(await fetch("/api/datasets/profile/export", {
    credentials: "same-origin",
    cache: "no-store",
  }), isExport);
}
