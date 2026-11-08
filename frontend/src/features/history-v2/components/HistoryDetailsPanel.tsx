import { Archive, ExternalLink, Layers3, MoreHorizontal, Pin, Star, X } from "lucide-react";
import type { HistoryChat } from "../types";
import s from "../HistoryV2.module.css";

export function HistoryDetailsPanel({ chat, loading, onClose, onPin, onImportant, onArchive, onOpenChat }: { chat: HistoryChat | null; loading: boolean; onClose: () => void; onPin: () => void; onImportant: () => void; onArchive: () => void; onOpenChat: () => void }) {
  if (loading) return <aside className={s.details}><div className={s.detailSkeleton} /><div className={s.detailSkeletonShort} /></aside>;
  if (!chat) return null;
  return (
    <aside className={s.details} aria-label="Информация о выбранном чате">
      <div className={s.detailTop}>
        <button type="button" className={s.detailClose} aria-label="Закрыть панель" onClick={onClose}><X /></button>
        <div className={s.detailTitle}><h2>{chat.title}</h2><div><button className={chat.pinned ? s.iconActive : ""} type="button" aria-label={chat.pinned ? "Открепить" : "Закрепить"} onClick={onPin}><Pin /></button><button type="button" aria-label="Дополнительные действия"><MoreHorizontal /></button></div></div>
        <time dateTime={chat.updatedAt}>{new Date(chat.updatedAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</time>
        <p className={s.detailSummary}>{chat.summary || "Краткое описание пока недоступно"}</p>
        <div className={s.detailBadges}>{chat.important && <span className={s.goldBadge}><Star />Важно</span>}{chat.archived && <span><Archive />Архив</span>}</div>
      </div>
      <div className={s.detailStats}>
        <button type="button" onClick={onOpenChat}><ExternalLink /><strong>Открыть</strong><span>чат</span></button>
        <button type="button" onClick={onImportant}><Star /><strong>{chat.important ? "Убрать" : "Важно"}</strong><span>отметка</span></button>
        <button type="button" onClick={onArchive}><Archive /><strong>{chat.archived ? "Вернуть" : "В архив"}</strong><span>статус</span></button>
      </div>
      <section className={s.detailSection}>
        <h3>Источники контекста</h3>
        {chat.context?.sources?.length ? chat.context.sources.map((source) => <div className={s.contextSource} key={source.id}><Layers3 /><span><strong>{source.title}</strong><small>{source.kind}</small></span></div>) : <p>Контекст не привязан к этому чату.</p>}
      </section>
    </aside>
  );
}
