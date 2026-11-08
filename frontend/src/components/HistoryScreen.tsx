"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  FileText,
  Mail,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { Chat } from "@/lib/chats";
import s from "./HistoryScreen.module.css";

type HistoryGroup = {
  key: "pinned" | "today" | "yesterday" | "week" | "earlier";
  label: string;
  chats: Chat[];
};

type HistoryFilter = "all" | "pinned" | "context";

function getOptionalChatField(chat: Chat, field: "metadata" | "pinned") {
  return (chat as Chat & { metadata?: unknown; pinned?: unknown })[field];
}

function getChatMetadata(chat: Chat) {
  const metadata = getOptionalChatField(chat, "metadata");
  return typeof metadata === "string" ? metadata.trim() : "";
}

function isChatPinned(chat: Chat) {
  return getOptionalChatField(chat, "pinned") === true;
}

function ChatIcon({ chat }: { chat: Chat }) {
  const metadata = getChatMetadata(chat).toLocaleLowerCase("ru-RU");
  if (metadata.includes("календар") || metadata.includes("встреч")) return <CalendarDays />;
  if (metadata.includes("документ")) return <FileText />;
  if (metadata.includes("финанс")) return <BarChart3 />;
  if (metadata.includes("почт")) return <Mail />;
  if (metadata.includes("проект")) return <BriefcaseBusiness />;
  return <MessageSquareText />;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const day = date.getDay() || 7;
  const result = startOfDay(date);
  result.setDate(result.getDate() - day + 1);
  return result;
}

function groupChats(chats: Chat[]): HistoryGroup[] {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = startOfWeek(now);
  const buckets: Record<HistoryGroup["key"], Chat[]> = { pinned: [], today: [], yesterday: [], week: [], earlier: [] };

  chats.forEach((chat) => {
    if (isChatPinned(chat)) {
      buckets.pinned.push(chat);
      return;
    }
    const updated = new Date(chat.updated_at);
    const key = updated >= today ? "today" : updated >= yesterday ? "yesterday" : updated >= week ? "week" : "earlier";
    buckets[key].push(chat);
  });

  const groups: HistoryGroup[] = [
    { key: "pinned", label: "Закреплённые", chats: buckets.pinned },
    { key: "today", label: "Сегодня", chats: buckets.today },
    { key: "yesterday", label: "Вчера", chats: buckets.yesterday },
    { key: "week", label: "Эта неделя", chats: buckets.week },
    { key: "earlier", label: "Ранее", chats: buckets.earlier },
  ];
  return groups.filter((group) => group.chats.length > 0);
}

function formatChatDate(chat: Chat, group: HistoryGroup["key"]) {
  const date = new Date(chat.updated_at);
  if (group === "today") return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (group === "yesterday") return `Вчера · ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }).replace(" г.", "");
}

export function HistoryScreen({
  chats,
  activeChatId,
  loading,
  error,
  onMenu,
  onNewChat,
  onOpenChat,
  onRenameChat,
}: {
  chats: Chat[];
  activeChatId: string;
  loading: boolean;
  error: string;
  onMenu: () => void;
  onNewChat: () => void;
  onOpenChat: (chat: Chat) => void;
  onRenameChat: (chat: Chat) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const groups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    const filtered = chats
      .filter((chat) => {
        const metadata = getChatMetadata(chat);
        const matchesQuery = !normalized || `${chat.title} ${metadata}`.toLocaleLowerCase("ru-RU").includes(normalized);
        const matchesFilter = filter === "all" || (filter === "pinned" ? isChatPinned(chat) : Boolean(metadata));
        return matchesQuery && matchesFilter;
      })
      .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
    return groupChats(filtered);
  }, [chats, filter, query]);

  return (
    <main className={s.history}>
      <header className={s.header}>
        <button className={s.mobileMenu} type="button" aria-label="Открыть меню" onClick={onMenu}>
          <Menu />
        </button>
        <div className={s.headerIdentity}>
          <div className={s.headingIcon}><Clock3 /></div>
          <div className={s.heading}>
            <h1>История</h1>
            <p>Все предыдущие диалоги и контекстные сессии</p>
          </div>
        </div>
        <button className={s.newChat} type="button" onClick={onNewChat}><Plus />Новый диалог</button>
      </header>

      <section className={s.toolbar} aria-label="Поиск и фильтры истории">
        <label className={s.search}>
          <Search />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по истории" aria-label="Поиск по истории" />
        </label>
        <button className={filter === "all" ? s.filterActive : s.filter} type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Все</button>
        <button className={filter === "pinned" ? s.filterActive : s.filter} type="button" aria-pressed={filter === "pinned"} onClick={() => setFilter("pinned")}>Закреплённые</button>
        <button className={filter === "context" ? s.filterActive : s.filter} type="button" aria-pressed={filter === "context"} onClick={() => setFilter("context")}>С контекстом</button>
        <button className={s.iconFilter} type="button" disabled aria-label="Дополнительные фильтры"><SlidersHorizontal /></button>
      </section>

      <div className={s.content}>
        {loading ? <p className={s.state}>Загружаем историю…</p> : error && chats.length === 0 ? (
          <p className={s.error} role="alert">{error}</p>
        ) : groups.length === 0 ? (
          <div className={s.empty}><Clock3 /><strong>{query ? "Ничего не найдено" : "История пока пуста"}</strong><p>{query ? "Попробуйте изменить поисковый запрос." : "Здесь появятся ваши диалоги."}</p></div>
        ) : groups.map((group) => (
          <section className={s.group} key={group.key} aria-labelledby={`history-${group.key}`}>
            <h2 id={`history-${group.key}`}>{group.label}</h2>
            <div className={s.groupList}>
              {group.chats.map((chat) => (
                <article className={`${s.row} ${chat.id === activeChatId ? s.active : ""}`} key={chat.id}>
                  <button className={s.rowMain} type="button" onClick={() => onOpenChat(chat)}>
                    <ChatIcon chat={chat} />
                    <span className={s.rowText}>
                      <span className={s.titleLine}><strong>{chat.title}</strong>{isChatPinned(chat) && <Pin className={s.pin} aria-label="Закреплён" />}</span>
                      {getChatMetadata(chat) && <small>{getChatMetadata(chat)}</small>}
                    </span>
                    <time dateTime={chat.updated_at}>{formatChatDate(chat, group.key)}</time>
                  </button>
                  {chat.id === activeChatId && (
                    <button className={s.renameAction} type="button" aria-label={`Переименовать диалог «${chat.title}»`} onClick={() => onRenameChat(chat)}>
                      <Pencil />
                    </button>
                  )}
                  <details className={s.actions}>
                    <summary aria-label={`Действия с диалогом «${chat.title}»`}><MoreHorizontal /></summary>
                    <div><button type="button" onClick={() => onRenameChat(chat)}>Переименовать</button></div>
                  </details>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
