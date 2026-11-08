import { Menu, Plus } from "lucide-react";
import s from "../HistoryV2.module.css";

export function HistoryHeader({ onMenu, onNewChat }: { onMenu: () => void; onNewChat: () => void }) {
  return (
    <header className={s.header}>
      <button className={s.mobileMenu} type="button" aria-label="Открыть меню" onClick={onMenu}><Menu /></button>
      <div>
        <h1>История чатов</h1>
        <p>Сохранённые AI-сессии, идеи и контекстные разговоры — всегда под рукой</p>
      </div>
      <button className={s.newChat} type="button" aria-label="Новый чат" onClick={onNewChat}><Plus aria-hidden="true" /><span>Новый чат</span></button>
    </header>
  );
}
