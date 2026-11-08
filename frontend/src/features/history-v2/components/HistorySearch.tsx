import { Search, X } from "lucide-react";
import s from "../HistoryV2.module.css";

export function HistorySearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className={s.search}>
      <Search aria-hidden="true" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Поиск по чатам, темам, файлам или ключевым словам..." aria-label="Поиск по истории чатов" />
      {value && <button type="button" aria-label="Очистить поиск" onClick={() => onChange("")}><X /></button>}
    </label>
  );
}
