import { historyRepository, subscribeHistoryOverlay } from "./currentHistoryAdapter";
import type { Chat } from "@/lib/chats";
import type { HistoryChat } from "../types";
import { normalizeChat } from "../utils/normalizeChat";

type HistoryState = { chats: HistoryChat[]; loading: boolean; loaded: boolean; error: string };
const serverSnapshot: HistoryState = { chats: [], loading: true, loaded: false, error: "" };
let state: HistoryState = serverSnapshot;
let request: Promise<void> | null = null;
let overlayCleanup: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit(next: HistoryState) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function fetchChats() {
  try {
    const chats = await historyRepository.getChats();
    emit({ chats, loading: false, loaded: true, error: "" });
  } catch (reason) {
    emit({ ...state, loading: false, loaded: true, error: reason instanceof Error ? reason.message : "Не удалось загрузить историю чатов." });
  }
}

export const historyStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    if (!overlayCleanup && typeof window !== "undefined") {
      overlayCleanup = subscribeHistoryOverlay(() => { void this.load(true); });
    }
    return () => listeners.delete(listener);
  },
  getSnapshot: () => state,
  getServerSnapshot: () => serverSnapshot,
  load(force = false) {
    if (request && !force) return request;
    if (state.loaded && !force) return Promise.resolve();
    emit({ ...state, loading: true, error: "" });
    request = fetchChats().finally(() => { request = null; });
    return request;
  },
  async mutate(action: () => Promise<void>) {
    await action();
    if (request) await request;
    else await this.load(true);
  },
  upsert(chat: Chat) {
    const normalized = normalizeChat(chat);
    emit({ ...state, loaded: true, chats: [normalized, ...state.chats.filter((item) => item.id !== normalized.id)] });
  },
};
