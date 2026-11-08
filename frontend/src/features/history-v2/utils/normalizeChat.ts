import type { Chat } from "@/lib/chats";
import type { HistoryChat, HistoryOverlayEntry } from "../types";

export function normalizeChat(chat: Chat, overlay: HistoryOverlayEntry = {}): HistoryChat {
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.created_at,
    updatedAt: chat.updated_at,
    pinned: overlay.pinned ?? false,
    important: overlay.important ?? false,
    archived: overlay.archived ?? false,
    capability: {
      contextAvailable: false,
      backendPersistence: false,
    },
  };
}
