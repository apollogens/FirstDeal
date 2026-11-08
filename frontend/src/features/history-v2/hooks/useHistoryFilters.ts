"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { HistoryFilter, HistorySort } from "../types";

const filters = new Set<HistoryFilter>(["all", "pinned", "important", "context", "archived"]);
const sorts = new Set<HistorySort>(["updated-desc", "updated-asc", "created-desc", "title"]);

export function useHistoryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const rawFilter = params.get("filter") as HistoryFilter | null;
  const rawSort = params.get("sort") as HistorySort | null;
  const filter = rawFilter && filters.has(rawFilter) ? rawFilter : "all";
  const sort = rawSort && sorts.has(rawSort) ? rawSort : "updated-desc";
  const [draftState, setDraftState] = useState({ base: query, value: query });
  const draft = draftState.base === query ? draftState.value : query;
  useEffect(() => {
    if (draft === query) return;
    const timer = window.setTimeout(() => update("q", draft || null), 200);
    return () => window.clearTimeout(timer);
  // update intentionally reads the latest URL params when the debounce fires.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, query]);

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.set("section", "history");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return {
    query,
    draft,
    setDraft: (value: string) => setDraftState({ base: query, value }),
    filter,
    sort,
    setFilter: (value: HistoryFilter) => update("filter", value === "all" ? null : value),
    setSort: (value: HistorySort) => update("sort", value === "updated-desc" ? null : value),
  };
}
