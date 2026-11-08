"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, LogOut, RefreshCw } from "lucide-react";
import {
  discoverCalendarConnections,
  disconnectCalendarConnection,
  getCalendarConnections,
  getExternalCalendars,
  getGoogleCalendarConnectUrl,
  syncCalendarConnection,
  updateCalendarConnection,
  type CalendarConnection,
  type ExternalCalendar,
} from "@/lib/calendar";
import s from "./Calendar.module.css";

function distinctConnected(connections: CalendarConnection[]) {
  const seen = new Set<string>();
  return connections.filter((connection) => {
    if (connection.status !== "connected") return false;
    const label = (connection.account_label || "").trim().toLowerCase();
    const key = label.includes("@") ? `${label}:${connection.calendar_id}` : connection.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function GoogleCalendarConnections({ onSynced }: { onSynced: () => void }) {
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const visibleConnections = distinctConnected(connections);
  const [calendars, setCalendars] = useState<Record<string, ExternalCalendar[]>>({});
  const [connectUrl, setConnectUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const popupTimer = useRef<number | null>(null);
  const onSyncedRef = useRef(onSynced);

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError("");
    try {
      setConnections(await getCalendarConnections(signal));
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Не удалось загрузить подключения.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  useEffect(() => () => {
    if (popupTimer.current !== null) window.clearInterval(popupTimer.current);
  }, []);

  async function refreshAndSync() {
    const discovered = await discoverCalendarConnections();
    setConnections(discovered);
    for (const connection of distinctConnected(discovered)) {
      await syncCalendarConnection(connection.id);
    }
    if (discovered.some((connection) => connection.status === "connected")) {
      await load();
      onSyncedRef.current();
    }
  }

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выполнить действие с Google Календарём.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className={s.calendar__connections} aria-label="Подключения Google Календаря">
      <div className={s.calendar__connectionsHead}>
        <div>
          <strong>Подключения Google</strong>
          <p>Подключите Google аккаунт и синхронизируйте события вместе с их описаниями.</p>
        </div>
        <div className={s.calendar__connectionsActions}>
          <button type="button" disabled={Boolean(busy)} onClick={() => {
            if (popupTimer.current !== null) window.clearInterval(popupTimer.current);
            const popup = window.open("about:blank", "restore-calendar-connect", "popup=yes,width=620,height=760,left=120,top=80");
            void run("connect", async () => {
              try {
                const result = await getGoogleCalendarConnectUrl();
                if (!result.connect_link_url.startsWith("https://")) throw new Error("Получена некорректная ссылка подключения.");
                if (popup) {
                  popup.location.replace(result.connect_link_url);
                  popup.focus();
                  popupTimer.current = window.setInterval(() => {
                    if (!popup.closed) return;
                    if (popupTimer.current !== null) window.clearInterval(popupTimer.current);
                    popupTimer.current = null;
                    void run("refresh", refreshAndSync);
                  }, 700);
                } else {
                  setConnectUrl(result.connect_link_url);
                }
              } catch (reason) {
                popup?.close();
                throw reason;
              }
            });
          }}>{visibleConnections.length ? "Подключить другой Google" : "Подключить Google"}</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void run("refresh", refreshAndSync)}><RefreshCw aria-hidden="true" /> Обновить и синхронизировать</button>
        </div>
      </div>
      {connectUrl && <a className={s.calendar__connectLink} href={connectUrl} target="_blank" rel="noopener noreferrer" onClick={() => setConnectUrl("")}><ExternalLink aria-hidden="true" /> Открыть авторизацию Google</a>}
      {error && <p className={s.calendar__connectionError} role="alert">{error}</p>}
      {loading ? <p className={s.calendar__connectionHint}>Загружаем подключения…</p> : visibleConnections.length === 0 ? <p className={s.calendar__connectionHint}>Google Календарь пока не подключён.</p> : (
        <div className={s.calendar__connectionList}>
          {visibleConnections.map((connection) => (
            <div className={s.calendar__connectionCard} key={connection.id}>
              <div className={s.calendar__connectionIdentity}>
                <strong>{connection.account_label || "Google Calendar"}</strong>
                <span>{connection.calendar_name || connection.calendar_id} · {connection.status === "connected" ? "Подключён" : "Недоступен"}{connection.is_default ? " · Основной" : ""}</span>
                {connection.last_synced_at && <small>Синхронизация: {new Date(connection.last_synced_at).toLocaleString("ru-RU")}</small>}
                {connection.last_error && <small className={s.calendar__connectionError}>{connection.last_error}</small>}
              </div>
              <div className={s.calendar__connectionsActions}>
                {calendars[connection.id] && (
                  <select aria-label={`Календарь для ${connection.account_label || "Google"}`} value={connection.calendar_id} disabled={Boolean(busy)} onChange={(event) => void run(connection.id, async () => {
                    const updated = await updateCalendarConnection(connection.id, event.target.value);
                    setConnections((current) => current.map((item) => item.id === updated.id ? updated : item));
                    await syncCalendarConnection(connection.id);
                    onSyncedRef.current();
                  })}>
                    {calendars[connection.id].map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
                  </select>
                )}
                <button type="button" disabled={Boolean(busy) || connection.status !== "connected"} onClick={() => void run(connection.id, async () => {
                  const available = await getExternalCalendars(connection.id);
                  setCalendars((current) => ({ ...current, [connection.id]: available }));
                })}>Выбрать календарь</button>
                <button type="button" disabled={Boolean(busy) || connection.status !== "connected"} onClick={() => void run(connection.id, async () => {
                  await syncCalendarConnection(connection.id);
                  await load();
                  onSyncedRef.current();
                })}><RefreshCw aria-hidden="true" /> Синхронизировать</button>
                <button type="button" disabled={Boolean(busy)} onClick={() => {
                  if (!window.confirm(`Выйти из Google-аккаунта ${connection.account_label || "Google"}? Его события исчезнут из календаря приложения, но останутся в Google.`)) return;
                  void run(connection.id, async () => {
                    await disconnectCalendarConnection(connection.id);
                    await load();
                    onSyncedRef.current();
                  });
                }}><LogOut aria-hidden="true" /> Выйти</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
