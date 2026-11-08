import { isCurrencyCode, isDateString, isDecimalString, isIsoDate } from "./api-validation";

export type FinanceType = "income" | "expense";
export type FinanceScope = "personal" | "work";

export type FinanceCategory = {
  id: string;
  user_id: string | null;
  name: string;
  type: FinanceType;
  created_at: string;
  updated_at: string;
};

export type FinanceTransaction = {
  id: string;
  user_id: string;
  category_id: string;
  scope: FinanceScope;
  amount: string;
  currency: string;
  type: FinanceType;
  date: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type FinanceSummary = {
  currency: string;
  income: string;
  expense: string;
  balance: string;
};

export type TransactionFilters = {
  scope?: FinanceScope;
  type?: FinanceType;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
};

export type SummaryFilters = Pick<
  TransactionFilters,
  "scope" | "date_from" | "date_to"
>;

export type TransactionPayload = {
  category_id: string;
  scope: FinanceScope;
  amount: string;
  currency: "RUB";
  type: FinanceType;
  date: string;
  description: string;
};

export type CategoryPayload = {
  name: string;
  type: FinanceType;
};

export class FinanceApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

const errorMessages: Record<string, string> = {
  "Category already exists": "Категория с таким названием уже существует.",
  "Category type cannot be changed while it is in use":
    "Нельзя изменить тип категории, потому что она уже используется в транзакциях.",
  "Category is used by transactions":
    "Категорию нельзя удалить, потому что она используется в транзакциях.",
  "Category not found": "Категория не найдена или больше недоступна.",
  "Transaction type must match category type":
    "Категория не соответствует типу операции.",
  "Transaction not found": "Транзакция не найдена или уже была удалена.",
  "date_from cannot be later than date_to":
    "Дата начала не может быть позже даты окончания.",
};

function appendParams(path: string, values: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

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

function isFinanceCategory(value: unknown): value is FinanceCategory {
  return isRecord(value) &&
    ["id", "name"].every(key => typeof value[key] === "string") &&
    ["created_at", "updated_at"].every(key => isDateString(value[key])) &&
    ["user_id"].every(key => isNullableString(value[key])) &&
    (value.type === "income" || value.type === "expense");
}

function isFinanceTransaction(value: unknown): value is FinanceTransaction {
  return isRecord(value) &&
    ["id", "user_id", "category_id", "description"].every(key => typeof value[key] === "string") &&
    isDecimalString(value.amount) && isCurrencyCode(value.currency) && isIsoDate(value.date) &&
    ["created_at", "updated_at"].every(key => isDateString(value[key])) &&
    (value.scope === "personal" || value.scope === "work") &&
    (value.type === "income" || value.type === "expense");
}

function isFinanceSummary(value: unknown): value is FinanceSummary {
  return isRecord(value) &&
    isCurrencyCode(value.currency) &&
    ["income", "expense", "balance"].every(key => isDecimalString(value[key]));
}

function isGoalAmount(value: unknown): value is string | number {
  return isDecimalString(value) || (typeof value === "number" && Number.isFinite(value));
}

function isFinancialGoal(value: unknown): value is FinancialGoal {
  return isRecord(value) &&
    ["id", "user_id", "title", "description"].every(key => typeof value[key] === "string") &&
    isCurrencyCode(value.currency) &&
    ["created_at", "updated_at"].every(key => isDateString(value[key])) &&
    (value.scope === "personal" || value.scope === "work") &&
    (value.target_date === null || isIsoDate(value.target_date)) &&
    ["target_amount", "current_amount", "remaining_amount"].every(key => isGoalAmount(value[key])) &&
    typeof value.is_completed === "boolean" &&
    typeof value.progress_percent === "number" && Number.isFinite(value.progress_percent);
}

async function request<T>(
  path: string,
  guard: (value: unknown) => value is T,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api/finance${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  const data: unknown = await response.json().catch(() => null);
  const error = isRecord(data) ? data : {};
  if (!response.ok) {
    const detail = typeof error.detail === "string" ? error.detail : "";
    const message =
      errorMessages[detail] ??
      (typeof error.message === "string" ? error.message : undefined) ??
      "Не удалось выполнить запрос. Попробуйте еще раз.";
    const fields: Record<string, string> = {};
    if (response.status === 422 && Array.isArray(error.detail)) {
      for (const item of error.detail) {
        const field: unknown = isRecord(item) && Array.isArray(item.loc) ? item.loc.at(-1) : undefined;
        if (typeof field === "string") fields[field] = "Проверьте поле.";
      }
    }
    throw new FinanceApiError(response.status, message, fields);
  }
  if (!guard(data)) throw new FinanceApiError(response.status, "Некорректный ответ сервера.");
  return data;
}

export const getFinanceSummary = (filters: SummaryFilters, signal?: AbortSignal) =>
  request<FinanceSummary>(
    appendParams("/summary", { currency: "RUB", ...filters }),
    isFinanceSummary,
    { signal },
  );

export const getCategories = (type?: FinanceType, signal?: AbortSignal) =>
  request<FinanceCategory[]>(
    appendParams("/categories", { type }),
    arrayOf(isFinanceCategory),
    { signal },
  );

export const createCategory = (body: CategoryPayload) =>
  request<FinanceCategory>("/categories", isFinanceCategory, { method: "POST", body });

export const updateCategory = (id: string, body: Partial<CategoryPayload>) =>
  request<FinanceCategory>(`/categories/${id}`, isFinanceCategory, { method: "PATCH", body });

export const deleteCategory = (id: string) =>
  request<null>(`/categories/${id}`, isNull, { method: "DELETE", body: {} });

export const getTransactions = (
  filters: TransactionFilters,
  signal?: AbortSignal,
) =>
  request<FinanceTransaction[]>(
    appendParams("/transactions", filters),
    arrayOf(isFinanceTransaction),
    { signal },
  );

export const createTransaction = (body: TransactionPayload) =>
  request<FinanceTransaction>("/transactions", isFinanceTransaction, { method: "POST", body });

export const updateTransaction = (
  id: string,
  body: Partial<TransactionPayload>,
) => request<FinanceTransaction>(`/transactions/${id}`, isFinanceTransaction, { method: "PATCH", body });

export const deleteTransaction = (id: string) =>
  request<null>(`/transactions/${id}`, isNull, { method: "DELETE", body: {} });

export type FinancialGoal = {
  id: string;
  user_id: string;
  scope: FinanceScope;
  title: string;
  description: string;
  target_amount: string | number;
  current_amount: string | number;
  currency: string;
  target_date: string | null;
  is_completed: boolean;
  progress_percent: number;
  remaining_amount: string | number;
  created_at: string;
  updated_at: string;
};

export type GoalPayload = {
  title: string;
  scope?: FinanceScope;
  description?: string;
  target_amount: number;
  current_amount?: number;
  currency?: "RUB";
  target_date?: string | null;
};

export const getGoals = (scope?: FinanceScope, is_completed?: boolean, signal?: AbortSignal) =>
  request<FinancialGoal[]>(appendParams("/goals", { scope, is_completed }), arrayOf(isFinancialGoal), { signal });

export const createGoal = (body: GoalPayload) =>
  request<FinancialGoal>("/goals", isFinancialGoal, { method: "POST", body });

export const updateGoal = (id: string, body: Partial<GoalPayload & { is_completed: boolean }>) =>
  request<FinancialGoal>(`/goals/${id}`, isFinancialGoal, { method: "PATCH", body });

export const deleteGoal = (id: string) =>
  request<null>(`/goals/${id}`, isNull, { method: "DELETE", body: {} });
