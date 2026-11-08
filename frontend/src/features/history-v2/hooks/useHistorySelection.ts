"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { historyRepository } from "../api/currentHistoryAdapter";
import type { HistoryChat } from "../types";

export function useHistorySelection(chats: HistoryChat[]) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("historyChat") ?? "";
  const fromList = chats.find((chat) => chat.id === selectedId) ?? null;
  const [resolved, setResolved] = useState<{ id: string; chat: HistoryChat | null }>({ id: "", chat: null });
  const sequence = useRef(0);

  useEffect(() => {
    const current = ++sequence.current;
    if (!selectedId || fromList) return;
    void historyRepository.getChat(selectedId).then((chat) => {
      if (sequence.current === current) setResolved({ id: selectedId, chat });
    });
  }, [fromList, selectedId]);

  function select(id: string | null) {
    sequence.current += 1;
    const next = new URLSearchParams(params.toString());
    if (id) next.set("historyChat", id); else next.delete("historyChat");
    next.set("section", "history");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const selected = fromList ?? (resolved.id === selectedId ? resolved.chat : null);
  const loading = Boolean(selectedId && !fromList && resolved.id !== selectedId);
  return { selectedId, selected, loading, select };
}
