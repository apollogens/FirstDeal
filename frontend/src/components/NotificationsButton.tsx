"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Brain, CalendarDays, Check, ExternalLink, Mail, UserRound, X } from "lucide-react";
import {
  getNotifications,
  getUnreadNotificationCount,
  updateNotificationStatus,
  confirmNotificationAction,
  type Notification,
  type NotificationStatus,
  type MemoryNotification,
  type CalendarReminderNotification,
  NotificationsApiError,
} from "@/lib/notifications";
import s from "./NotificationsButton.module.css";
import { subscribeUserEvents } from "@/lib/user-events";

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [unavailableCount, setUnavailableCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const fetchedCountRef = useRef(0);

  const loadCount = useCallback(async (signal?: AbortSignal) => {
    try {
      setUnread((await getUnreadNotificationCount(signal)).count);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (reason instanceof NotificationsApiError && reason.status === 401) window.location.replace("/login?next=%2Fworkspace");
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { items: page, unavailableCount: unavailable } = await getNotifications();
      fetchedCountRef.current = page.length;
      setItems(page);
      setHasMore(page.length === 100);
      setUnavailableCount(unavailable);
    } catch (reason) {
      if (reason instanceof NotificationsApiError && reason.status === 401) {
        window.location.replace("/login?next=%2Fworkspace");
        return;
      }
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить уведомления.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const { items: page, unavailableCount: unavailable } = await getNotifications(undefined, undefined, fetchedCountRef.current);
      fetchedCountRef.current += page.length;
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.filter((item) => !known.has(item.id))];
      });
      setHasMore(page.length === 100);
      setUnavailableCount(unavailable);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить уведомления.");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void getUnreadNotificationCount(controller.signal)
      .then(({ count }) => setUnread(count))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        if (reason instanceof NotificationsApiError && reason.status === 401) window.location.replace("/login?next=%2Fworkspace");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return subscribeUserEvents((event) => {
      if (event.event !== "notification") return;
      void loadCount();
      if (open) void loadItems();
    });
  }, [loadCount, loadItems, open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  async function setStatus(item: Notification, status: NotificationStatus) {
    if (updatingId) return;
    setUpdatingId(item.id);
    setError("");
    try {
      const updated = await updateNotificationStatus(item.id, status);
      setItems((current) => status === "dismissed"
        ? current.filter((entry) => entry.id !== item.id)
        : current.map((entry) => entry.id === item.id ? updated : entry));
      if (status === "dismissed") await loadItems();
      await loadCount();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось обновить уведомление.");
    } finally {
      setUpdatingId("");
    }
  }

  async function confirmAction(item: MemoryNotification) {
    if (updatingId) return;
    setUpdatingId(item.id);
    setError("");
    try {
      const res = await confirmNotificationAction(item.id);
      setItems((current) =>
        current.map((entry) => {
          if (entry.id !== item.id) return entry;
          return {
            ...entry,
            status: "read",
            payload: {
              ...entry.payload,
              action_status: res.action_status,
              created_event_id: res.created_event_id,
            },
          } as Notification;
        })
      );
      await loadCount();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось подтвердить действие.");
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <div className={s.notifications} ref={rootRef}>
      <button
        className={s.notifications__trigger}
        type="button"
        aria-label={unread ? `Уведомления: ${unread} непрочитанных` : "Уведомления"}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void loadItems();
        }}
      >
        <Bell />
        {unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <section className={s.notifications__panel} aria-label="Уведомления">
          <header><div><h2>Уведомления</h2>{unread > 0 && <p>{unread} непрочитанных</p>}</div><button type="button" aria-label="Закрыть уведомления" onClick={() => setOpen(false)}><X /></button></header>
          <div className={s.notifications__list}>
            {loading ? <p role="status" className={s.notifications__state}>Загрузка…</p> : items.length === 0 && !error ? <p className={s.notifications__state}>Уведомлений пока нет.</p> : items.map((item) => (
              <article className={item.status === "unread" ? s.notifications__unread : undefined} key={item.id}>
                <div><strong>{item.title}</strong><time>{new Date(item.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div>
                <p>{item.body}</p>
                {item.kind === "news_digest" ? (
                  item.payload.items.map((news) => (
                    <a key={news.url} href={news.url} target="_blank" rel="noopener noreferrer">
                      <span>{news.title}</span>
                      <ExternalLink />
                    </a>
                  ))
                ) : item.kind === "calendar_reminder" ? (
                  <div className={s.notifications__event}>
                    <CalendarDays />
                    <span>{"reminder_id" in item.payload ? `${item.payload.title} · ${new Date(item.payload.remind_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : formatReminder(item.payload)}</span>
                  </div>
                ) : item.kind === "workflow_checkin" ? (
                  <div className={s.notifications__event}><CalendarDays /><span>{item.payload.title}</span></div>
                ) : (
                  <div className={s.notifications__memorySection}>
                    <div className={s.notifications__event}>
                      <Brain />
                      <span>
                        {item.payload.action_type === "create_calendar_event"
                          ? "Проактивное предложение встречи"
                          : item.payload.severity === "critical"
                            ? "Критичное изменение памяти"
                            : item.payload.severity === "high"
                              ? "Важное изменение памяти"
                              : "Обновление памяти"}
                      </span>
                    </div>

                    {item.payload.action_type === "create_calendar_event" && item.payload.action_payload && (
                      <div className={s.notifications__actionCard}>
                        <div className={s.notifications__actionTime}>
                          <CalendarDays />
                          <span>{formatActionTime(item.payload.action_payload.starts_at, item.payload.action_payload.ends_at)}</span>
                        </div>
                        {item.payload.action_payload.location && (
                          <div className={s.notifications__actionLoc}>
                            {item.payload.action_payload.location}
                          </div>
                        )}
                        {item.payload.citations && item.payload.citations.length > 0 && (
                          <div className={s.notifications__actionCitations}>
                            {item.payload.citations.map((c, idx) => (
                              <span key={idx} className={s.notifications__actionCitation}>
                                {c.source_type === "email" ? <><Mail aria-hidden="true" /> Письмо</> : <><UserRound aria-hidden="true" /> Профиль</>}: {c.fact_key || c.fact_value || c.source_id}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.payload.action_status === "pending" && (
                          <button
                            type="button"
                            className={s.notifications__confirmBtn}
                            disabled={Boolean(updatingId)}
                            onClick={() => void confirmAction(item)}
                          >
                            <Check />
                            {updatingId === item.id ? "Создание..." : "Подтвердить встречу"}
                          </button>
                        )}
                        {item.payload.action_status === "confirmed" && (
                          <div className={s.notifications__actionSuccess}>
                            <Check />
                            <span>Встреча создана в календаре</span>
                          </div>
                        )}
                      </div>
                    )}

                    {item.payload.action_status === "downgraded" && (
                      <div className={s.notifications__actionDowngraded}>
                        <span>Требует ручного подтверждения (конфликт / устаревшие данные)</span>
                      </div>
                    )}
                  </div>
                )}
                <footer>
                  {item.status === "unread" && <button type="button" disabled={Boolean(updatingId)} onClick={() => void setStatus(item, "read")}><Check />Прочитано</button>}
                  <button type="button" disabled={Boolean(updatingId)} onClick={() => void setStatus(item, "dismissed")}><X />Скрыть</button>
                </footer>
              </article>
            ))}
            {error && <p className={s.notifications__error} role="alert">{error}</p>}
            {!loading && unavailableCount > 0 && <p className={s.notifications__error} role="status">{unavailableCount} старых уведомлений недоступны: отсутствует прежний ключ шифрования.</p>}
            {!loading && hasMore && <button className={s.notifications__more} type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Загрузка…" : "Показать ещё"}</button>}
          </div>
        </section>
      )}
    </div>
  );
}

function formatReminder(payload: CalendarReminderNotification["payload"]) {
  const startsAt = new Date(payload.starts_at);
  const endsAt = payload.ends_at ? new Date(payload.ends_at) : null;
  const startLabel = startsAt.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const endLabel = endsAt?.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return [payload.title, endLabel ? `${startLabel}-${endLabel}` : startLabel, payload.location].filter(Boolean).join(" · ");
}

function formatActionTime(startsAtStr?: string | null, endsAtStr?: string | null) {
  if (!startsAtStr) return "";
  const startsAt = new Date(startsAtStr);
  const endsAt = endsAtStr ? new Date(endsAtStr) : null;
  const startLabel = startsAt.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const endLabel = endsAt?.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return endLabel ? `${startLabel} - ${endLabel}` : startLabel;
}
