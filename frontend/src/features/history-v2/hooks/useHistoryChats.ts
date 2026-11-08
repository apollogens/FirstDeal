"use client";

import { useEffect, useSyncExternalStore } from "react";
import { historyStore } from "../api/historyStore";

export function useHistoryChats() {
  const snapshot = useSyncExternalStore(historyStore.subscribe.bind(historyStore), historyStore.getSnapshot, historyStore.getServerSnapshot);
  useEffect(() => { void historyStore.load(); }, []);
  return { ...snapshot, retry: () => historyStore.load(true) };
}
