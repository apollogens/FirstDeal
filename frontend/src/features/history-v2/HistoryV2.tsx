"use client";

import { useMemo, useState } from "react";
import type { Chat } from "@/lib/chats";
import { DeleteChatDialog } from "./components/DeleteChatDialog";
import { EmptyHistory } from "./components/EmptyHistory";
import { HistoryDetailsPanel } from "./components/HistoryDetailsPanel";
import { HistoryFilters } from "./components/HistoryFilters";
import { HistoryGroup } from "./components/HistoryGroup";
import { HistoryHeader } from "./components/HistoryHeader";
import { HistorySearch } from "./components/HistorySearch";
import { HistorySkeleton } from "./components/HistorySkeleton";
import { useHistoryChats } from "./hooks/useHistoryChats";
import { useHistoryFilters } from "./hooks/useHistoryFilters";
import { useHistoryMutations } from "./hooks/useHistoryMutations";
import { useHistorySelection } from "./hooks/useHistorySelection";
import type { HistoryChat, HistoryGroupKey } from "./types";
import { filterChats } from "./utils/filterChats";
import { groupChatsByDate } from "./utils/groupChatsByDate";
import { sortChats } from "./utils/sortChats";
import s from "./HistoryV2.module.css";

export function HistoryV2({ onMenu, onNewChat, onOpenChat }: { onMenu: () => void; onNewChat: () => Promise<Chat | void> | void; onOpenChat: (chatId: string) => void }) {
  const { chats, loading, error, retry } = useHistoryChats();
  const filters = useHistoryFilters();
  const selection = useHistorySelection(chats);
  const mutations = useHistoryMutations();
  const [collapsed, setCollapsed] = useState<Partial<Record<HistoryGroupKey, boolean>>>({});
  const [renamingId, setRenamingId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<HistoryChat | null>(null);
  const visible = useMemo(() => sortChats(filterChats(chats, filters.filter, filters.query), filters.sort), [chats, filters.filter, filters.query, filters.sort]);
  const groups = useMemo(() => groupChatsByDate(visible), [visible]);

  async function archive(chat: HistoryChat) {
    const saved = await mutations.setArchived(chat.id, !chat.archived);
    if (saved && selection.selectedId === chat.id && !chat.archived) selection.select(null);
  }

  async function remove() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const saved = await mutations.deleteChat(id);
    if (!saved) return;
    if (selection.selectedId === id) selection.select(null);
    setDeleteTarget(null);
  }

  const rowActions = {
    selectedId: selection.selectedId,
    renamingId,
    pending: mutations.status === "pending",
    onSelect: (id: string) => selection.select(id),
    onRename: setRenamingId,
    onRenameSave: async (chat: HistoryChat, title: string) => { if (await mutations.rename(chat.id, title)) setRenamingId(""); },
    onRenameCancel: () => setRenamingId(""),
    onPin: (chat: HistoryChat) => { void mutations.setPinned(chat.id, !chat.pinned); },
    onImportant: (chat: HistoryChat) => { void mutations.setImportant(chat.id, !chat.important); },
    onArchive: (chat: HistoryChat) => { void archive(chat); },
    onDelete: setDeleteTarget,
    onOpenChat,
  };

  return (
    <main className={`${s.history} ${selection.selected || selection.loading ? s.withDetails : ""}`}>
      <div className={s.mainColumn}>
        <HistoryHeader onMenu={onMenu} onNewChat={() => { void onNewChat(); }} />
        <div className={s.toolbar}>
          <HistorySearch value={filters.draft} onChange={filters.setDraft} />
          <HistoryFilters filter={filters.filter} sort={filters.sort} onFilter={filters.setFilter} onSort={filters.setSort} />
        </div>
        <div className={s.list}>
          {loading && !chats.length ? <HistorySkeleton /> : error && !chats.length ? <div className={s.error} role="alert"><strong>Не удалось загрузить историю</strong><p>{error}</p><button type="button" onClick={() => void retry()}>Повторить</button></div>
            : !groups.length ? <EmptyHistory filter={filters.filter} query={filters.query} />
            : groups.map((group) => <HistoryGroup key={group.key} group={group} collapsed={Boolean(collapsed[group.key])} onToggle={() => setCollapsed((current) => ({ ...current, [group.key]: !current[group.key] }))} actions={rowActions} />)}
        </div>
        {mutations.error && <div className={s.toast} role="alert">{mutations.error}</div>}
      </div>
      <HistoryDetailsPanel chat={selection.selected} loading={selection.loading} onClose={() => selection.select(null)}
        onPin={() => selection.selected && void mutations.setPinned(selection.selected.id, !selection.selected.pinned)}
        onImportant={() => selection.selected && void mutations.setImportant(selection.selected.id, !selection.selected.important)}
        onArchive={() => selection.selected && void archive(selection.selected)}
        onOpenChat={() => selection.selected && onOpenChat(selection.selected.id)} />
      <DeleteChatDialog chat={deleteTarget} pending={mutations.status === "pending"} onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
    </main>
  );
}
