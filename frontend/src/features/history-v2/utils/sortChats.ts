import type { HistoryChat, HistorySort } from "../types";

export function sortChats(chats: HistoryChat[], sort: HistorySort) {
  return [...chats].sort((left, right) => {
    if (sort === "title") return left.title.localeCompare(right.title, "ru-RU");
    if (sort === "created-desc") return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    const delta = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    return sort === "updated-asc" ? -delta : delta;
  });
}
