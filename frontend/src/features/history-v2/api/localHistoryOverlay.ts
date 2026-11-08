import type { HistoryOverlay, HistoryOverlayEntry } from "../types";

export const HISTORY_OVERLAY_KEY = "restore-agent:history-v2:overlay:v1";
const OVERLAY_EVENT = "restore-agent:history-v2:overlay-change";

function isOverlay(value: unknown): value is HistoryOverlay {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    return (!("titleOverride" in entry) || entry.titleOverride === undefined || typeof entry.titleOverride === "string")
      && ["pinned", "important", "archived", "locallyDeleted"].every(key => {
        const field: unknown = Reflect.get(entry, key);
        return field === undefined || typeof field === "boolean";
      });
  });
}

// TODO(history-backend): Replace LocalHistoryOverlay with backend-persisted Chat mutations.
export class LocalHistoryOverlay {
  read(): HistoryOverlay {
    if (typeof window === "undefined") return {};
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(HISTORY_OVERLAY_KEY) ?? "{}");
      return isOverlay(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  update(chatId: string, patch: Partial<HistoryOverlayEntry>) {
    if (typeof window === "undefined") return;
    const current = this.read();
    const next = { ...current, [chatId]: { ...current[chatId], ...patch } };
    window.localStorage.setItem(HISTORY_OVERLAY_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(OVERLAY_EVENT));
  }

  subscribe(listener: () => void) {
    if (typeof window === "undefined") return () => undefined;
    const onStorage = (event: StorageEvent) => { if (event.key === HISTORY_OVERLAY_KEY) listener(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(OVERLAY_EVENT, listener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(OVERLAY_EVENT, listener);
    };
  }
}
