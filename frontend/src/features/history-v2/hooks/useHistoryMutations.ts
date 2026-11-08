"use client";

import { useState } from "react";
import { historyRepository } from "../api/currentHistoryAdapter";
import { historyStore } from "../api/historyStore";
import type { MutationStatus } from "../types";

export function useHistoryMutations() {
  const [status, setStatus] = useState<MutationStatus>("idle");
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    if (status === "pending") return false;
    setStatus("pending");
    setError("");
    try {
      await historyStore.mutate(action);
      setStatus("idle");
      return true;
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить изменение.");
      return false;
    }
  }
  return {
    status,
    error,
    rename: (id: string, title: string) => run(() => historyRepository.renameChat(id, title)),
    setPinned: (id: string, value: boolean) => run(() => historyRepository.setPinned(id, value)),
    setImportant: (id: string, value: boolean) => run(() => historyRepository.setImportant(id, value)),
    setArchived: (id: string, value: boolean) => run(() => historyRepository.setArchived(id, value)),
    deleteChat: (id: string) => run(() => historyRepository.deleteChat(id)),
  };
}
