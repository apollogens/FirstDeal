import { Trash2, X } from "lucide-react";
import type { HistoryChat } from "../types";
import s from "../HistoryV2.module.css";
import { useDialogFocus } from "@/components/useDialogFocus";

export function DeleteChatDialog({ chat, pending, onCancel, onConfirm }: { chat: HistoryChat | null; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  useDialogFocus(Boolean(chat), '[aria-labelledby="delete-chat-title"]', () => { if (!pending) onCancel(); }, chat ? `[data-history-menu="${CSS.escape(chat.id)}"]` : undefined);
  if (!chat) return null;
  return (
    <div className={s.dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className={s.dialog} role="alertdialog" aria-modal="true" aria-labelledby="delete-chat-title">
        <button className={s.dialogClose} type="button" aria-label="Закрыть" onClick={onCancel}><X /></button>
        <span className={s.dialogIcon}><Trash2 /></span>
        <h2 id="delete-chat-title">Удалить чат?</h2>
        <p>«{chat.title}» будет скрыт из истории на этом устройстве.</p>
        <div><button type="button" onClick={onCancel}>Отмена</button><button className={s.deleteButton} type="button" disabled={pending} onClick={onConfirm}>{pending ? "Удаляем…" : "Удалить"}</button></div>
      </section>
    </div>
  );
}
