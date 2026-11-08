import { apiErrorMessage, arrayOf, isDateString, isNumber, isString, nullable, objectOf, oneOf } from "./api-validation";

export type TrackedTopic = {
  id: string;
  user_id: string;
  query: string;
  scope: "personal" | "work";
  check_interval_minutes: number;
  last_checked_at: string | null;
  next_check_at: string;
  created_at: string;
  updated_at: string;
};

export class TrackedTopicsApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const isTopic = objectOf<TrackedTopic>({ id: isString, user_id: isString, query: isString, scope: oneOf("personal", "work"), check_interval_minutes: isNumber, last_checked_at: nullable(isDateString), next_check_at: isDateString, created_at: isDateString, updated_at: isDateString });

export async function getTrackedTopics(signal?: AbortSignal, limit = 20, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const response = await fetch(`/api/tracked-topics?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new TrackedTopicsApiError(
      response.status,
      apiErrorMessage(data, "Не удалось загрузить отслеживаемые темы.", "message"),
    );
  }
  if (!arrayOf(isTopic)(data)) throw new TrackedTopicsApiError(502, "Сервис вернул некорректные отслеживаемые темы.");
  return data;
}
