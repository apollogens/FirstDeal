import { getChat, getChats, updateChat } from "@/lib/chats";
import type { HistoryRepository } from "./historyRepository";
import { LocalHistoryOverlay } from "./localHistoryOverlay";
import { normalizeChat } from "../utils/normalizeChat";

const overlay = new LocalHistoryOverlay();

export class CurrentHistoryAdapter implements HistoryRepository {
  async getChats() {
    const metadata = overlay.read();
    const chats = await getChats();
    return chats.filter((chat) => !metadata[chat.id]?.locallyDeleted).map((chat) => normalizeChat(chat, metadata[chat.id]));
  }

  async getChat(id: string) {
    const metadata = overlay.read();
    if (metadata[id]?.locallyDeleted) return null;
    try {
      return normalizeChat(await getChat(id), metadata[id]);
    } catch {
      return null;
    }
  }

  async renameChat(id: string, title: string) {
    await updateChat(id, title.trim());
  }

  async setPinned(id: string, pinned: boolean) {
    // TODO(history-backend): Replace local pin overlay with PATCH /chats/:id.
    overlay.update(id, { pinned });
  }

  async setImportant(id: string, important: boolean) {
    // TODO(history-backend): Replace local important overlay with PATCH /chats/:id.
    overlay.update(id, { important });
  }

  async setArchived(id: string, archived: boolean) {
    // TODO(history-backend): Replace local archive overlay with PATCH /chats/:id.
    overlay.update(id, { archived });
  }

  async deleteChat(id: string) {
    // TODO(history-backend): Replace local hiding with DELETE /chats/:id.
    overlay.update(id, { locallyDeleted: true, pinned: false });
  }
}

export const historyRepository = new CurrentHistoryAdapter();
export const subscribeHistoryOverlay = (listener: () => void) => overlay.subscribe(listener);
