import type { HistoryChat, HistoryGroupKey, HistoryGroupModel } from "../types";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const result = startOfDay(date);
  result.setDate(result.getDate() - ((result.getDay() || 7) - 1));
  return result;
}

export function groupChatsByDate(chats: HistoryChat[], now = new Date()): HistoryGroupModel[] {
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = startOfWeek(now);
  const buckets: Record<HistoryGroupKey, HistoryChat[]> = { today: [], yesterday: [], week: [], earlier: [] };
  for (const chat of chats) {
    const updated = new Date(chat.updatedAt);
    const key = updated >= today ? "today" : updated >= yesterday ? "yesterday" : updated >= week ? "week" : "earlier";
    buckets[key].push(chat);
  }
  const groups: Array<[HistoryGroupKey, string]> = [
    ["today", "Сегодня"],
    ["yesterday", "Вчера"],
    ["week", "На этой неделе"],
    ["earlier", "Ранее"],
  ];
  return groups.map(([key, label]) => ({ key, label, chats: buckets[key] })).filter((group) => group.chats.length > 0);
}
