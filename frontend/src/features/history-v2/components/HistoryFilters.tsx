import { Archive, ArrowDownUp, Layers3, ListFilter, Pin, Star } from "lucide-react";
import type { HistoryFilter, HistorySort } from "../types";
import s from "../HistoryV2.module.css";

const filterOptions: Array<{ value: HistoryFilter; label: string; icon?: typeof Pin }> = [
  { value: "all", label: "Все" },
  { value: "pinned", label: "Закреплённые", icon: Pin },
  { value: "important", label: "Важные", icon: Star },
  { value: "context", label: "С контекстом", icon: Layers3 },
  { value: "archived", label: "Архив", icon: Archive },
];

export function HistoryFilters({ filter, sort, onFilter, onSort }: { filter: HistoryFilter; sort: HistorySort; onFilter: (value: HistoryFilter) => void; onSort: (value: HistorySort) => void }) {
  return (
    <div className={s.filters}>
      <div className={s.filterChips} role="group" aria-label="Фильтры истории">
        {filterOptions.map(({ value, label, icon: Icon }) => (
          <button className={filter === value ? s.filterActive : s.filter} type="button" key={value} aria-pressed={filter === value} onClick={() => onFilter(value)}>
            {Icon ? <Icon /> : <ListFilter />}{label}
          </button>
        ))}
      </div>
      <label className={s.sort}>
        <ArrowDownUp />
        <span className={s.srOnly}>Сортировка</span>
        <select value={sort} onChange={(event) => onSort(event.target.value as HistorySort)}>
          <option value="updated-desc">Сначала новые</option>
          <option value="updated-asc">Сначала старые</option>
          <option value="created-desc">Недавно созданные</option>
          <option value="title">По названию</option>
        </select>
      </label>
    </div>
  );
}
