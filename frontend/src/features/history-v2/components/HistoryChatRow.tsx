"use client";

import { Archive, MessageSquareText, Paperclip, Pin, Star } from "lucide-react";
import type { HistoryChat } from "../types";
import { HistoryActionMenu } from "./HistoryActionMenu";
import { RenameChatInline } from "./RenameChatInline";
import s from "../HistoryV2.module.css";

function formatDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(" г.", "");
}

export function HistoryChatRow({ chat, selected, renaming, pending, onSelect, onRename, onRenameSave, onRenameCancel, onPin, onImportant, onArchive, onDelete, onOpenChat }: { chat: HistoryChat; selected: boolean; renaming: boolean; pending: boolean; onSelect: () => void; onRename: () => void; onRenameSave: (title: string) => void; onRenameCancel: () => void; onPin: () => void; onImportant: () => void; onArchive: () => void; onDelete: () => void; onOpenChat: () => void }) {
  return (
    <article className={`${s["history-chat-row"]} ${selected ? s["history-chat-row--selected"] : ""} ${chat.archived ? s["history-chat-row--archived"] : ""}`} onClick={(event) => { if (event.target instanceof Element && !event.target.closest("button, input, summary, a")) onSelect(); }}>
      {renaming ? <div className={s["history-chat-row__selection"]}><span className={s["history-chat-row__icon"]} aria-hidden="true"><MessageSquareText /></span><div className={s["history-chat-row__copy"]}><RenameChatInline title={chat.title} pending={pending} onSave={onRenameSave} onCancel={onRenameCancel} />{chat.summary && <span className={s["history-chat-row__summary"]}>{chat.summary}</span>}</div></div> : <button className={s["history-chat-row__selection"]} type="button" aria-label={`Выбрать чат «${chat.title}»`} aria-pressed={selected} onClick={(event) => { event.stopPropagation(); onSelect(); }}><span className={s["history-chat-row__icon"]} aria-hidden="true"><MessageSquareText /></span><span className={s["history-chat-row__copy"]}><strong>{chat.title}</strong>{chat.summary && <span className={s["history-chat-row__summary"]}>{chat.summary}</span>}<span className={s["history-chat-row__meta"]}>
        {chat.pinned && <span className={s.purpleBadge}><Pin />Закреплён</span>}
        {chat.important && <span className={s.goldBadge}><Star />Важно</span>}
        {chat.archived && <span><Archive />Архив</span>}
        {chat.context?.available && <span>С контекстом</span>}
        {typeof chat.attachmentsCount === "number" && chat.attachmentsCount > 0 && <span><Paperclip />{chat.attachmentsCount} файла</span>}
      </span></span></button>}
      <button className={`${s["history-chat-row__pin"]} ${chat.pinned ? s["history-chat-row__pin--active"] : ""}`} type="button" aria-label={chat.pinned ? "Открепить чат" : "Закрепить чат"} onClick={onPin}><Pin /></button>
      <time dateTime={chat.updatedAt}>{formatDate(chat.updatedAt)}</time>
      <HistoryActionMenu chat={chat} onRename={onRename} onPin={onPin} onImportant={onImportant} onArchive={onArchive} onDelete={onDelete} onOpenChat={onOpenChat} />
    </article>
  );
}
