import type { HistoryChat, HistoryFilter } from "../types";

export function filterChats(chats: HistoryChat[], filter: HistoryFilter, query: string) {
  const normalized = query.trim().toLocaleLowerCase("ru-RU");
  return chats.filter((chat) => {
    if (filter !== "archived" && chat.archived) return false;
    if (filter === "archived" && !chat.archived) return false;
    if (filter === "pinned" && !chat.pinned) return false;
    if (filter === "important" && !chat.important) return false;
    if (filter === "context" && !chat.context?.available) return false;
    if (!normalized) return true;
    return `${chat.title} ${chat.summary ?? ""}`.toLocaleLowerCase("ru-RU").includes(normalized);
  });
}
