import { ChevronDown } from "lucide-react";
import type { HistoryChat, HistoryGroupModel } from "../types";
import { HistoryChatRow } from "./HistoryChatRow";
import s from "../HistoryV2.module.css";

type RowActions = {
  selectedId: string;
  renamingId: string;
  pending: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onRenameSave: (chat: HistoryChat, title: string) => void;
  onRenameCancel: () => void;
  onPin: (chat: HistoryChat) => void;
  onImportant: (chat: HistoryChat) => void;
  onArchive: (chat: HistoryChat) => void;
  onDelete: (chat: HistoryChat) => void;
  onOpenChat: (id: string) => void;
};

export function HistoryGroup({ group, collapsed, onToggle, actions }: { group: HistoryGroupModel; collapsed: boolean; onToggle: () => void; actions: RowActions }) {
  return (
    <section className={s.group}>
      <button className={s.groupHeading} type="button" aria-expanded={!collapsed} onClick={onToggle}>
        <span>{group.label}<small>{group.chats.length}</small></span><ChevronDown className={collapsed ? s.chevronCollapsed : ""} />
      </button>
      {!collapsed && <div className={s.groupList}>{group.chats.map((chat) => (
        <HistoryChatRow key={chat.id} chat={chat} selected={actions.selectedId === chat.id} renaming={actions.renamingId === chat.id} pending={actions.pending}
          onSelect={() => actions.onSelect(chat.id)} onRename={() => actions.onRename(chat.id)} onRenameSave={(title) => actions.onRenameSave(chat, title)} onRenameCancel={actions.onRenameCancel}
          onPin={() => actions.onPin(chat)} onImportant={() => actions.onImportant(chat)} onArchive={() => actions.onArchive(chat)} onDelete={() => actions.onDelete(chat)} onOpenChat={() => actions.onOpenChat(chat.id)} />
      ))}</div>}
    </section>
  );
}
