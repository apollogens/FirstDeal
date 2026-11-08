"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CircleDot,
  CircleX,
  ListTodo,
  Menu,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  SlidersHorizontal,
  X,
  Trash2,
} from "lucide-react";
import {
  createTask,
  deleteTask,
  getTasks,
  updateTask,
  type TaskPriority,
  type TaskScope,
  type TaskStatus,
  type UserTask,
  type UserTaskCreate,
} from "@/lib/tasks";
import s from "./Tasks.module.css";
import { useDialogFocus } from "./useDialogFocus";

const priorityLabels: Record<TaskPriority, string> = {
  urgent: "Срочно",
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "К выполнению",
  in_progress: "В процессе",
  done: "Завершено",
  cancelled: "Отменено",
};

const statusFilters: Array<{ value: TaskStatus | "all"; label: string }> = [
  { value: "all", label: "Все" },
  { value: "todo", label: "К выполнению" },
  { value: "in_progress", label: "В процессе" },
  { value: "done", label: "Завершено" },
  { value: "cancelled", label: "Отменено" },
];

const scopeFilters: Array<{ value: TaskScope | "all"; label: string }> = [
  { value: "all", label: "Все" },
  { value: "personal", label: "Личное" },
  { value: "work", label: "Работа" },
];

const priorityFilters: Array<{ value: TaskPriority | "all"; label: string }> = [
  { value: "all", label: "Все приоритеты" },
  { value: "urgent", label: "Срочно" },
  { value: "high", label: "Высокий" },
  { value: "medium", label: "Средний" },
  { value: "low", label: "Низкий" },
];

const columns: Array<{
  status: TaskStatus;
  title: string;
  description: string;
  tone: "todo" | "progress" | "done" | "cancelled";
}> = [
  {
    status: "todo",
    title: "К выполнению",
    description: "Задачи, которые ждут выполнения",
    tone: "todo",
  },
  {
    status: "in_progress",
    title: "В процессе",
    description: "То, над чем вы работаете сейчас",
    tone: "progress",
  },
  {
    status: "done",
    title: "Завершено",
    description: "Успешно завершённые задачи",
    tone: "done",
  },
  {
    status: "cancelled",
    title: "Отменено",
    description: "Задачи, которые больше не актуальны",
    tone: "cancelled",
  },
];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDeadline(value: string | null | undefined, status: TaskStatus) {
  if (!value) return { label: "Без срока", overdue: false };

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: "Без срока", overdue: false };

  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const taskDay = startOfDay(date);
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const overdue = date.getTime() < now.getTime() && status !== "done" && status !== "cancelled";

  let dayLabel: string;
  if (taskDay.getTime() === today.getTime()) {
    dayLabel = "Сегодня";
  } else if (taskDay.getTime() === tomorrow.getTime()) {
    dayLabel = "Завтра";
  } else {
    dayLabel = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  }

  return {
    label: `${overdue ? "Просрочено · " : ""}${dayLabel} · ${time}`,
    overdue,
  };
}

export function TasksScreen({ onMenu }: { onMenu: () => void }) {
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<TaskScope | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<UserTask | null>(null);
  const [modalTitle, setModalTitle] = useState("");
  const [modalScope, setModalScope] = useState<TaskScope>("personal");
  const [modalPriority, setModalPriority] = useState<TaskPriority>("medium");
  const [modalStatus, setModalStatus] = useState<TaskStatus>("todo");
  const [modalDueDate, setModalDueDate] = useState("");
  const [modalDescription, setModalDescription] = useState("");
  const [saving, setSaving] = useState(false);
  useDialogFocus(modalOpen, '[aria-labelledby="task-drawer-title"]', () => { if (!saving) setModalOpen(false); }, editingTask ? `[data-task-edit="${CSS.escape(editingTask.id)}"]` : 'button[aria-label="Новая задача"]');

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);

  const loadTasks = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const data = await getTasks({}, signal);
      if (!signal?.aborted) setTasks(data || []);
    } catch (err) {
      if (!signal?.aborted) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить список задач");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getTasks({}, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setTasks(data || []);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Не удалось загрузить список задач");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const openCreateModal = () => {
    setEditingTask(null);
    setModalTitle("");
    setModalScope("personal");
    setModalPriority("medium");
    setModalStatus("todo");
    setModalDueDate("");
    setModalDescription("");
    setActionError("");
    setModalOpen(true);
  };

  const openEditModal = (task: UserTask) => {
    setEditingTask(task);
    setModalTitle(task.title);
    setModalScope(task.scope);
    setModalPriority(task.priority);
    setModalStatus(task.status);
    setModalDueDate(task.due_date ? task.due_date.slice(0, 16) : "");
    setModalDescription(task.description || "");
    setActionError("");
    setModalOpen(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!modalTitle.trim()) return;

    setSaving(true);
    setActionError("");

    try {
      const payload: UserTaskCreate = {
        title: modalTitle.trim(),
        scope: modalScope,
        priority: modalPriority,
        status: modalStatus,
        due_date: modalDueDate ? new Date(modalDueDate).toISOString() : null,
        description: modalDescription.trim(),
      };

      if (editingTask) {
        const updated = await updateTask(editingTask.id, payload);
        setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)));
      } else {
        const created = await createTask(payload);
        setTasks((prev) => [created, ...prev]);
      }

      setModalOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Ошибка при сохранении задачи");
    } finally {
      setSaving(false);
    }
  };

  const handleMoveTask = useCallback(
    async (taskId: string, nextStatus: TaskStatus) => {
      const previousTask = tasks.find((task) => task.id === taskId);
      if (!previousTask || previousTask.status === nextStatus || movingTaskId === taskId) return;

      setMovingTaskId(taskId);
      setActionError("");
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)),
      );

      try {
        const updated = await updateTask(taskId, { status: nextStatus });
        setTasks((prev) => prev.map((task) => (task.id === taskId ? updated : task)));
      } catch (err) {
        setTasks((prev) => prev.map((task) => (task.id === taskId ? previousTask : task)));
        setActionError(err instanceof Error ? err.message : "Не удалось изменить статус задачи");
      } finally {
        setMovingTaskId(null);
      }
    },
    [movingTaskId, tasks],
  );

  const handleToggleStatus = (task: UserTask) => {
    const nextStatus: TaskStatus = task.status === "done" ? "todo" : "done";
    void handleMoveTask(task.id, nextStatus);
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(
      "Удалить задачу?\n\nЗадача будет удалена без возможности восстановления.",
    );
    if (!confirmed) return;

    setActionError("");
    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((task) => task.id !== id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось удалить задачу");
    }
  };

  const resetFilters = () => {
    setSearchQuery("");
    setScopeFilter("all");
    setStatusFilter("all");
    setPriorityFilter("all");
  };

  const visibleTasks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("ru-RU");

    return tasks.filter((task) => {
      if (scopeFilter !== "all" && task.scope !== scopeFilter) return false;
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;

      if (query) {
        const title = task.title.toLocaleLowerCase("ru-RU");
        const description = (task.description || "").toLocaleLowerCase("ru-RU");
        if (!title.includes(query) && !description.includes(query)) return false;
      }

      return true;
    });
  }, [priorityFilter, scopeFilter, searchQuery, statusFilter, tasks]);

  const tasksByStatus = useMemo(() => {
    return columns.reduce<Record<TaskStatus, UserTask[]>>(
      (acc, column) => {
        acc[column.status] = visibleTasks.filter((task) => task.status === column.status);
        return acc;
      },
      { todo: [], in_progress: [], done: [], cancelled: [] },
    );
  }, [visibleTasks]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const inProgress = tasks.filter((task) => task.status === "in_progress").length;
    const done = tasks.filter((task) => task.status === "done").length;
    const urgent = tasks.filter((task) => task.priority === "urgent").length;
    return { total, inProgress, done, urgent };
  }, [tasks]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    scopeFilter !== "all" ||
    statusFilter !== "all" ||
    priorityFilter !== "all";

  const handleDragStart = (event: React.DragEvent<HTMLElement>, task: UserTask) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea")) {
      event.preventDefault();
      return;
    }

    setDraggingTaskId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDragOverStatus(null);
  };

  const handleColumnDragOver = (event: React.DragEvent<HTMLElement>, status: TaskStatus) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverStatus(status);
  };

  const handleColumnDrop = (event: React.DragEvent<HTMLElement>, status: TaskStatus) => {
    event.preventDefault();
    const taskId = draggingTaskId || event.dataTransfer.getData("text/plain");
    setDragOverStatus(null);
    setDraggingTaskId(null);
    if (taskId) void handleMoveTask(taskId, status);
  };

  return (
    <main className={s.tasks}>
      <header className={s.tasks__header}>
        <div className={s.tasks__titleGroup}>
          <button className={s.tasks__mobileMenu} aria-label="Открыть меню" onClick={onMenu}>
            <Menu size={20} />
          </button>
          <div>
            <h1>Задачи</h1>
            <p>Личные и рабочие задачи</p>
          </div>
        </div>

        <button className={s.tasks__createBtn} aria-label="Новая задача" onClick={openCreateModal}>
          <Plus size={18} />
          <span>Новая задача</span>
        </button>
      </header>

      <section className={s.tasks__statsGrid} aria-label="Статистика задач">
        <div className={s.tasks__statCard}>
          <div>
            <span className={s.tasks__statLabel}>Всего</span>
            <strong className={s.tasks__statValue}>{stats.total}</strong>
          </div>
          <span className={`${s.tasks__statIcon} ${s["tasks__statIcon--total"]}`}>
            <ListTodo size={17} />
          </span>
        </div>

        <div className={s.tasks__statCard}>
          <div>
            <span className={s.tasks__statLabel}>В работе</span>
            <strong className={s.tasks__statValue}>{stats.inProgress}</strong>
          </div>
          <span className={`${s.tasks__statIcon} ${s["tasks__statIcon--progress"]}`}>
            <PlayCircle size={17} />
          </span>
        </div>

        <div className={s.tasks__statCard}>
          <div>
            <span className={s.tasks__statLabel}>Выполнено</span>
            <strong className={s.tasks__statValue}>{stats.done}</strong>
          </div>
          <span className={`${s.tasks__statIcon} ${s["tasks__statIcon--done"]}`}>
            <CheckCircle2 size={17} />
          </span>
        </div>

        <div className={s.tasks__statCard}>
          <div>
            <span className={`${s.tasks__statLabel} ${s["tasks__statLabel--urgent"]}`}>
              <i aria-hidden="true" />
              Срочные
            </span>
            <strong className={s.tasks__statValue}>{stats.urgent}</strong>
          </div>
          <span className={`${s.tasks__statIcon} ${s["tasks__statIcon--urgent"]}`}>
            <AlertCircle size={17} />
          </span>
        </div>
      </section>

      <div className={s.tasks__searchWrap}>
        <Search size={20} className={s.tasks__searchIcon} />
        <input
          className={s.tasks__search}
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Поиск по задачам"
          aria-label="Поиск по задачам"
        />
      </div>

      <section className={s.tasks__filtersBar} aria-label="Фильтры задач">
        <div className={s.tasks__filterGroups}>
          <div className={s.tasks__segmented}>
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                className={`${s.tasks__chip} ${statusFilter === filter.value ? s["tasks__chip--active"] : ""}`}
                onClick={() => setStatusFilter(filter.value)}
                aria-pressed={statusFilter === filter.value}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <span className={s.tasks__filterDivider} aria-hidden="true" />

          <div className={s.tasks__segmented}>
            {scopeFilters.map((filter) => (
              <button
                key={filter.value}
                className={`${s.tasks__chip} ${scopeFilter === filter.value ? s["tasks__chip--active"] : ""}`}
                onClick={() => setScopeFilter(filter.value)}
                aria-pressed={scopeFilter === filter.value}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <span className={s.tasks__filterDivider} aria-hidden="true" />

          <div className={s.tasks__segmented}>
            {priorityFilters.map((filter) => (
              <button
                key={filter.value}
                className={`${s.tasks__chip} ${priorityFilter === filter.value ? s["tasks__chip--active"] : ""}`}
                onClick={() => setPriorityFilter(filter.value)}
                aria-pressed={priorityFilter === filter.value}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className={`${s.tasks__filterButton} ${hasActiveFilters ? s["tasks__filterButton--active"] : ""}`}
          onClick={resetFilters}
          aria-label="Сбросить фильтры"
          title="Сбросить фильтры"
        >
          <SlidersHorizontal size={18} />
        </button>
      </section>

      {actionError && (
        <div className={s.tasks__actionError} role="alert">
          <AlertCircle size={16} />
          <span>{actionError}</span>
          <button onClick={() => setActionError("")} aria-label="Закрыть сообщение об ошибке">
            <X size={15} />
          </button>
        </div>
      )}

      {loading ? (
        <section className={s.tasks__board} aria-label="Загрузка задач">
          {columns.map((column) => (
            <div key={column.status} className={`${s.tasks__column} ${s[`tasks__column--${column.tone}`]}`}>
              <div className={s.tasks__skeletonHeader} />
              <div className={s.tasks__skeletonCard} />
              <div className={s.tasks__skeletonCard} />
            </div>
          ))}
        </section>
      ) : error ? (
        <div className={s.tasks__stateBox} role="alert">
          <AlertCircle size={24} />
          <strong>Не удалось загрузить задачи</strong>
          <span>{error}</span>
          <button onClick={() => void loadTasks()}>Попробовать снова</button>
        </div>
      ) : tasks.length === 0 ? (
        <div className={s.tasks__stateBox}>
          <ListTodo size={28} />
          <strong>У вас пока нет задач</strong>
          <span>Создайте первую задачу, чтобы она появилась на доске.</span>
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className={s.tasks__stateBox}>
          <Search size={26} />
          <strong>По выбранным фильтрам задач нет</strong>
          <button onClick={resetFilters}>Сбросить фильтры</button>
        </div>
      ) : (
        <section className={s.tasks__board} aria-label="Доска задач" tabIndex={0}>
          {columns.map((column) => {
            const columnTasks = tasksByStatus[column.status];
            const isDragOver = dragOverStatus === column.status;

            return (
              <section
                key={column.status}
                className={`${s.tasks__column} ${s[`tasks__column--${column.tone}`]} ${
                  isDragOver ? s["tasks__column--dragOver"] : ""
                }`}
                onDragOver={(event) => handleColumnDragOver(event, column.status)}
                onDragEnter={(event) => handleColumnDragOver(event, column.status)}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setDragOverStatus(null);
                  }
                }}
                onDrop={(event) => handleColumnDrop(event, column.status)}
              >
                <header className={s.tasks__columnHeader}>
                  <div className={s.tasks__columnTitleRow}>
                    <span className={`${s.tasks__columnIcon} ${s[`tasks__columnIcon--${column.tone}`]}`}>
                      {column.status === "todo" && <ListTodo size={19} strokeWidth={1.8} />}
                      {column.status === "in_progress" && <CircleDot size={19} strokeWidth={1.8} />}
                      {column.status === "done" && <CheckCircle2 size={19} strokeWidth={1.8} />}
                      {column.status === "cancelled" && <CircleX size={19} strokeWidth={1.8} />}
                    </span>
                    <h2>{column.title}</h2>
                    <span className={s.tasks__columnCount}>{columnTasks.length}</span>
                  </div>
                  <p>{column.description}</p>
                </header>

                <div className={s.tasks__columnBody}>
                  {columnTasks.length === 0 ? (
                    <div className={s.tasks__columnEmpty}><span className={s.tasks__dragHint}>Перетащите задачу сюда</span><span className={s.tasks__touchHint}>Пока нет задач</span></div>
                  ) : (
                    columnTasks.map((task) => {
                      const isDone = task.status === "done";
                      const isCancelled = task.status === "cancelled";
                      const deadline = formatDeadline(task.due_date, task.status);
                      const isDragging = draggingTaskId === task.id;
                      const isMoving = movingTaskId === task.id;

                      return (
                        <article
                          key={task.id}
                          className={`${s.tasks__card} ${isDone ? s["tasks__card--done"] : ""} ${
                            isCancelled ? s["tasks__card--cancelled"] : ""
                          } ${deadline.overdue ? s["tasks__card--overdue"] : ""} ${
                            isDragging ? s["tasks__card--dragging"] : ""
                          } ${isMoving ? s["tasks__card--moving"] : ""}`}
                          draggable={!isMoving}
                          onDragStart={(event) => handleDragStart(event, task)}
                          onDragEnd={handleDragEnd}
                          aria-busy={isMoving}
                        >
                          <div className={s.tasks__cardTop}>
                            <input
                              type="checkbox"
                              className={s.tasks__checkbox}
                              checked={isDone}
                              onChange={() => handleToggleStatus(task)}
                              disabled={isMoving}
                              aria-label={`Отметить задачу «${task.title}» как ${isDone ? "невыполненную" : "выполненную"}`}
                            />

                            <div className={s.tasks__cardBody}>
                              <h3 className={`${s.tasks__cardTitle} ${isDone ? s["tasks__cardTitle--done"] : ""}`}>
                                {task.title}
                              </h3>
                              {task.description && <p className={s.tasks__cardDesc}>{task.description}</p>}
                            </div>

                            <div className={s.tasks__cardActions}>
                              <button
                                className={s.tasks__actionBtn}
                                onClick={() => openEditModal(task)}
                                data-task-edit={task.id}
                                aria-label="Редактировать задачу"
                                disabled={isMoving}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                className={s.tasks__actionBtn}
                                onClick={() => void handleDelete(task.id)}
                                aria-label="Удалить задачу"
                                title="Удалить задачу"
                                disabled={isMoving}
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>
                          </div>

                          <div className={s.tasks__badges}>
                            <span className={`${s.tasks__badge} ${s[`tasks__badge--${task.priority}`]}`}>
                              {priorityLabels[task.priority]}
                            </span>
                            <span className={s.tasks__scopeBadge}>{task.scope === "work" ? "Работа" : "Личное"}</span>
                            {isCancelled && <span className={s.tasks__cancelledBadge}>Отменено</span>}
                          </div>

                          <div className={`${s.tasks__deadline} ${deadline.overdue ? s["tasks__deadline--overdue"] : ""}`}>
                            <Calendar size={15} />
                            <span>{deadline.label}</span>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </section>
      )}

      {modalOpen && (
        <div className={s.tasks__drawerBackdrop} onMouseDown={() => setModalOpen(false)}>
          <aside
            className={s.tasks__drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-drawer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={s.tasks__drawerHeader}>
              <div>
                <h2 id="task-drawer-title">{editingTask ? "Редактирование задачи" : "Новая задача"}</h2>
                <p>{editingTask ? statusLabels[editingTask.status] : "Добавьте новую задачу в список"}</p>
              </div>
              <button className={s.tasks__drawerClose} onClick={() => setModalOpen(false)} aria-label="Закрыть">
                <X size={19} />
              </button>
            </div>

            <form className={s.tasks__form} onSubmit={(event) => { void handleSave(event); }}>
              <div className={s.tasks__drawerContent}>
                <div className={s.tasks__field}>
                  <label htmlFor="task-title">Название *</label>
                  <input
                    id="task-title"
                    className={s.tasks__input}
                    required
                    maxLength={255}
                    value={modalTitle}
                    onChange={(event) => setModalTitle(event.target.value)}
                    placeholder="Название задачи"
                    autoFocus
                  />
                </div>

                <div className={s.tasks__field}>
                  <label htmlFor="task-description">Описание</label>
                  <textarea
                    id="task-description"
                    className={s.tasks__textarea}
                    rows={5}
                    maxLength={5000}
                    value={modalDescription}
                    onChange={(event) => setModalDescription(event.target.value)}
                    placeholder="Дополнительные детали"
                  />
                </div>

                <div className={s.tasks__field}>
                  <span className={s.tasks__fieldLabel}>Сфера</span>
                  <div className={s.tasks__formSegmented}>
                    <button
                      type="button"
                      className={`${s.tasks__formSegment} ${modalScope === "personal" ? s["tasks__formSegment--active"] : ""}`}
                      onClick={() => setModalScope("personal")}
                    >
                      Личное
                    </button>
                    <button
                      type="button"
                      className={`${s.tasks__formSegment} ${modalScope === "work" ? s["tasks__formSegment--active"] : ""}`}
                      onClick={() => setModalScope("work")}
                    >
                      Работа
                    </button>
                  </div>
                </div>

                <div className={s.tasks__formGrid}>
                  <div className={s.tasks__field}>
                    <label htmlFor="task-priority">Приоритет</label>
                    <select
                      id="task-priority"
                      className={s.tasks__select}
                      value={modalPriority}
                      onChange={(event) => setModalPriority(event.target.value as TaskPriority)}
                    >
                      <option value="low">Низкий</option>
                      <option value="medium">Средний</option>
                      <option value="high">Высокий</option>
                      <option value="urgent">Срочно</option>
                    </select>
                  </div>

                  <div className={s.tasks__field}>
                    <label htmlFor="task-status">Статус</label>
                    <select
                      id="task-status"
                      className={s.tasks__select}
                      value={modalStatus}
                      onChange={(event) => setModalStatus(event.target.value as TaskStatus)}
                    >
                      <option value="todo">К выполнению</option>
                      <option value="in_progress">В процессе</option>
                      <option value="done">Завершено</option>
                      <option value="cancelled">Отменено</option>
                    </select>
                  </div>
                </div>

                <div className={s.tasks__field}>
                  <label htmlFor="task-deadline">Дедлайн</label>
                  <input
                    id="task-deadline"
                    type="datetime-local"
                    className={s.tasks__input}
                    value={modalDueDate}
                    onChange={(event) => setModalDueDate(event.target.value)}
                  />
                </div>

                {actionError && <div className={s.tasks__formError}>{actionError}</div>}
              </div>

              <div className={s.tasks__drawerFooter}>
                <button type="button" className={s.tasks__cancelBtn} onClick={() => setModalOpen(false)}>
                  Отмена
                </button>
                <button type="submit" className={s.tasks__saveBtn} disabled={saving || !modalTitle.trim()}>
                  {saving ? "Сохранение..." : editingTask ? "Сохранить изменения" : "Создать задачу"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </main>
  );
}
