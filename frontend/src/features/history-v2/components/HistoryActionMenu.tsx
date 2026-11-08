"use client";

import { useRef, useState } from "react";
import { Archive, ExternalLink, MoreHorizontal, Pencil, Pin, RotateCcw, Star, Trash2 } from "lucide-react";
import { useActionMenu } from "@/components/useActionMenu";
import type { HistoryChat } from "../types";
import s from "../HistoryV2.module.css";

export function HistoryActionMenu({ chat, onRename, onPin, onImportant, onArchive, onDelete, onOpenChat }: { chat: HistoryChat; onRename: () => void; onPin: () => void; onImportant: () => void; onArchive: () => void; onDelete: () => void; onOpenChat: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDetailsElement>(null);

  useActionMenu(open, root, () => setOpen(false));

  const run = (event: React.MouseEvent, action: () => void) => {
    event.stopPropagation();
    action();
    setOpen(false);
  };
  return (
    <details ref={root} className={s.actionMenu} open={open} onClick={(event) => event.stopPropagation()}>
      <summary data-history-menu={chat.id} aria-haspopup="menu" aria-label={`Действия с чатом «${chat.title}»`} aria-expanded={open} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((value) => !value); }}><MoreHorizontal /></summary>
      {open && <div data-anchored-popover role="menu" className={s.actionMenuPanel}>
        {!chat.archived && <button role="menuitem" type="button" onClick={(event) => run(event, onRename)}><Pencil />Переименовать</button>}
        {!chat.archived && <button role="menuitem" type="button" onClick={(event) => run(event, onPin)}><Pin />{chat.pinned ? "Открепить" : "Закрепить"}</button>}
        {!chat.archived && <button role="menuitem" type="button" onClick={(event) => run(event, onImportant)}><Star />{chat.important ? "Убрать из важных" : "Пометить важным"}</button>}
        {!chat.archived && <button role="menuitem" type="button" onClick={(event) => run(event, onOpenChat)}><ExternalLink />Открыть чат</button>}
        <span role="separator" />
        <button role="menuitem" type="button" onClick={(event) => run(event, onArchive)}>{chat.archived ? <RotateCcw /> : <Archive />}{chat.archived ? "Восстановить" : "Архивировать"}</button>
        <span role="separator" />
        <button role="menuitem" className={s.dangerAction} type="button" onClick={(event) => run(event, onDelete)}><Trash2 />Удалить</button>
      </div>}
    </details>
  );
}
