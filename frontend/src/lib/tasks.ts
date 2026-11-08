export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskScope = "personal" | "work";

export type UserTask = {
  id: string;
  user_id: string;
  scope: TaskScope;
  title: string;
  description: string;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
};

export type UserTaskCreate = {
  title: string;
  scope?: TaskScope;
  description?: string;
  due_date?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
};

export type UserTaskUpdate = Partial<UserTaskCreate>;

export class TaskApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

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

async function request<T>(
  path: string,
  validate: (value: unknown) => value is T,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api/tasks${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  const data: unknown = response.status === 204 ? null : await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = typeof data === "object" && data !== null ? data : {};
    const detail = "detail" in error && typeof error.detail === "string" ? error.detail : "";
    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    throw new TaskApiError(
      response.status,
      detail || message || "Не удалось выполнить запрос к задачам.",
    );
  }
  if (!validate(data)) throw new TaskApiError(502, "Сервис вернул некорректные данные задач.");
  return data;
}

// Mirrors src/schemas/user_task.py without coercing malformed server values.
function isTask(value: unknown): value is UserTask {
  if (typeof value !== "object" || value === null) return false;
  return "id" in value && typeof value.id === "string"
    && "user_id" in value && typeof value.user_id === "string"
    && "scope" in value && (value.scope === "personal" || value.scope === "work")
    && "title" in value && typeof value.title === "string"
    && "description" in value && typeof value.description === "string"
    && "due_date" in value && (value.due_date === null || isTimestamp(value.due_date))
    && "priority" in value && (value.priority === "low" || value.priority === "medium" || value.priority === "high" || value.priority === "urgent")
    && "status" in value && (value.status === "todo" || value.status === "in_progress" || value.status === "done" || value.status === "cancelled")
    && "created_at" in value && isTimestamp(value.created_at)
    && "updated_at" in value && isTimestamp(value.updated_at);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isTaskList(value: unknown): value is UserTask[] {
  return Array.isArray(value) && value.every(isTask);
}

function isEmptyResponse(value: unknown): value is null {
  return value === null;
}

export const getTasks = (
  filters: { scope?: TaskScope; status?: TaskStatus; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
) => request(appendParams("", filters), isTaskList, { signal, method: "GET" });

export async function getAllTasks(signal?: AbortSignal): Promise<UserTask[]> {
  const pageSize = 100;
  const tasks: UserTask[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const page = await getTasks({ limit: pageSize, offset }, signal);
    tasks.push(...page);
    if (page.length < pageSize) return tasks;
  }
}

export const createTask = (body: UserTaskCreate) =>
  request("", isTask, { method: "POST", body });

export const updateTask = (id: string, body: UserTaskUpdate) =>
  request(`/${encodeURIComponent(id)}`, isTask, { method: "PATCH", body });

export const deleteTask = (id: string) =>
  request(`/${encodeURIComponent(id)}`, isEmptyResponse, { method: "DELETE" });
