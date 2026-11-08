"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import s from "../HistoryV2.module.css";

export function RenameChatInline({ title, pending, onSave, onCancel }: { title: string; pending: boolean; onSave: (title: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(title);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const valid = Boolean(value.trim()) && value.trim() !== title;
  return (
    <form className={s.rename} onSubmit={(event) => { event.preventDefault(); if (valid && !pending) onSave(value.trim()); }}>
      <input ref={input} value={value} maxLength={200} aria-label="Новое название чата" onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }} />
      <button type="submit" disabled={!valid || pending} aria-label="Сохранить название"><Check /></button>
      <button type="button" onClick={onCancel} aria-label="Отменить переименование"><X /></button>
    </form>
  );
}
