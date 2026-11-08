import type { HistoryChat } from "../types";

export interface HistoryRepository {
  getChats(): Promise<HistoryChat[]>;
  getChat(id: string): Promise<HistoryChat | null>;
  renameChat(id: string, title: string): Promise<void>;
  setPinned(id: string, pinned: boolean): Promise<void>;
  setImportant(id: string, important: boolean): Promise<void>;
  setArchived(id: string, archived: boolean): Promise<void>;
  deleteChat(id: string): Promise<void>;
}
