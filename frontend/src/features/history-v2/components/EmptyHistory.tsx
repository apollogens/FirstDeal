import { Clock3, Layers3, Pin, Search, Star } from "lucide-react";
import type { HistoryFilter } from "../types";
import s from "../HistoryV2.module.css";

export function EmptyHistory({ filter, query }: { filter: HistoryFilter; query: string }) {
  const state = query ? { Icon: Search, title: "Ничего не найдено", text: "Попробуйте изменить поисковый запрос или фильтр." }
    : filter === "context" ? { Icon: Layers3, title: "Контекстные данные пока не подключены к истории чатов", text: "Здесь появятся чаты, когда backend передаст связь с контекстом." }
    : filter === "pinned" ? { Icon: Pin, title: "Нет закреплённых чатов", text: "Закрепите нужный разговор, чтобы быстро находить его здесь и в боковой панели." }
    : filter === "important" ? { Icon: Star, title: "Нет важных чатов", text: "Отмечайте содержательно важные разговоры звёздочкой." }
    : filter === "archived" ? { Icon: Clock3, title: "Архив пуст", text: "Архивированные разговоры появятся здесь." }
    : { Icon: Clock3, title: "История пока пуста", text: "Создайте новый чат, и он появится в истории." };
  return <div className={s.empty}><state.Icon /><strong>{state.title}</strong><p>{state.text}</p></div>;
}
