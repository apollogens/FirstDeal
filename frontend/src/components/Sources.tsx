import {
  Brain,
  CalendarDays,
  ChevronDown,
  Database,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Info,
  Mail,
  Plus,
  Wallet,
  X,
} from "lucide-react";
import { availableSources, type Source } from "@/lib/demo";
import s from "./Workspace.module.css";
import { useDialogFocus } from "./useDialogFocus";

export type SourceCategory = Exclude<Source["kind"], "file"> | "all";

function sourceCountLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun = mod100 >= 11 && mod100 <= 14
    ? "источников"
    : mod10 === 1
      ? "источник"
      : mod10 >= 2 && mod10 <= 4
        ? "источника"
        : "источников";
  return `${count} ${noun} ${mod10 === 1 && mod100 !== 11 ? "доступен" : "доступны"} в этом диалоге`;
}

function sourceIcon(kind: Source["kind"]) {
  if (kind === "mail") return Mail;
  if (kind === "calendar") return CalendarDays;
  if (kind === "memory") return Brain;
  if (kind === "finance") return Wallet;
  return kind === "document" ? FileText : FileSpreadsheet;
}

export function SourceList({
  sources,
  onOpen,
  onRemove,
}: {
  sources: Source[];
  onOpen: (source: Source) => void;
  onRemove?: (source: Source) => void;
}) {
  return (
    <div className={s.workspace__sourceList}>
      {sources.map((source) => {
        const Icon = sourceIcon(source.kind);
        return (
          <div className={s.workspace__sourceRow} key={source.id}>
            <button className={s.workspace__source} onClick={() => onOpen(source)}>
              <Icon />
              <span>
                <span>{source.title}</span>
                <small>{source.description}</small>
              </span>
              <ExternalLink aria-label="Открыть источник" />
            </button>
            {onRemove && (
              <button className={s.workspace__sourceRemove} aria-label={`Убрать ${source.title} из контекста`} onClick={() => onRemove(source)}>
                <X />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
export function ConversationContextPanel({
  sources,
  onClose,
  onAdd,
  onOpen,
  onRemove,
}: {
  sources: Source[];
  onClose: () => void;
  onAdd: () => void;
  onOpen: (s: Source) => void;
  onRemove: (s: Source) => void;
}) {
  return (
    <aside className={s.workspace__contextPanel} aria-label="Контекст разговора">
      <div className={s.workspace__contextHeading}>
        <h2>Контекст разговора</h2>
        <button aria-label="Закрыть контекст" onClick={onClose}>
          <X />
        </button>
      </div>
      <p className={s.workspace__contextCount}>
        {sourceCountLabel(sources.length)}
      </p>
      <button className={s.workspace__secondary} onClick={onAdd}>
        <Plus />
        Добавить
      </button>
      <div className={s.workspace__contextScroll}>
        <SourceGroup
          title="Письмо"
          emptyText="Здесь будут письма, которые вы добавите в контекст"
          icon={Mail}
          sources={sources.filter((source) => source.kind === "mail")}
          onOpen={onOpen}
          onRemove={onRemove}
        />
        <SourceGroup
          title="Другие источники"
          emptyText="Здесь будут другие источники (файлы, заметки и т. д.)"
          icon={Database}
          sources={sources.filter((source) => source.kind !== "mail")}
          onOpen={onOpen}
          onRemove={onRemove}
        />
      </div>
      <p className={s.workspace__contextFoot}>
        <Info />
        Вы выбираете, какой контекст доступен AI
      </p>
    </aside>
  );
}

function SourceGroup({
  title,
  emptyText,
  icon: Icon,
  sources,
  onOpen,
  onRemove,
}: {
  title: string;
  emptyText: string;
  icon: typeof Mail;
  sources: Source[];
  onOpen: (source: Source) => void;
  onRemove: (source: Source) => void;
}) {
  return (
    <details className={s.workspace__sourceGroup} open>
      <summary>
        <span className={s.workspace__sourceGroupIcon}><Icon /></span>
        <strong>{title}</strong>
        <ChevronDown aria-hidden="true" />
      </summary>
      {sources.length > 0 ? (
        <SourceList sources={sources} onOpen={onOpen} onRemove={onRemove} />
      ) : (
        <p className={s.workspace__sourceEmpty}>{emptyText}</p>
      )}
    </details>
  );
}

const categories: { value: SourceCategory; label: string; icon: typeof Mail }[] = [
  { value: "all", label: "Все", icon: Plus },
  { value: "mail", label: "Почта", icon: Mail },
  { value: "calendar", label: "Календарь", icon: CalendarDays },
  { value: "document", label: "Документы", icon: FileText },
  { value: "memory", label: "Память", icon: Brain },
  { value: "finance", label: "Финансы", icon: Wallet },
];

export function SourcePicker({
  open,
  category,
  attached,
  onCategoryChange,
  onAttach,
  onClose,
  returnFocusSelector,
}: {
  open: boolean;
  category: SourceCategory;
  attached: Source[];
  onCategoryChange: (value: SourceCategory) => void;
  onAttach: (source: Source) => void;
  onClose: () => void;
  returnFocusSelector?: string;
}) {
  useDialogFocus(open, '[aria-labelledby="source-picker-title"]', onClose, returnFocusSelector);
  if (!open) return null;
  const attachedIds = new Set(attached.map((source) => source.id));
  const items = availableSources.filter((source) => category === "all" || source.kind === category);
  return (
    <div className={s.workspace__pickerBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={s.workspace__sourcePicker} role="dialog" aria-modal="true" aria-labelledby="source-picker-title">
        <header>
          <div><h2 id="source-picker-title">Добавить источник</h2><p>Выберите контекст для текущего диалога</p></div>
          <button aria-label="Закрыть выбор источника" onClick={onClose}><X /></button>
        </header>
        <div className={s.workspace__pickerCategories} role="tablist" aria-label="Тип источника">
          {categories.map(({ value, label, icon: Icon }, index) => (
            <button autoFocus={index === 0} key={value} role="tab" aria-selected={category === value} className={category === value ? s["workspace__pickerCategory--active"] : ""} onClick={() => onCategoryChange(value)}>
              <Icon />{label}
            </button>
          ))}
        </div>
        <div className={s.workspace__pickerItems}>
          {items.length === 0 && <p className={s.workspace__sourceEmpty}>Нет доступных источников этого типа. Документы можно прикрепить прямо в поле сообщения.</p>}
          {items.map((source) => {
            const Icon = sourceIcon(source.kind);
            const isAttached = attachedIds.has(source.id);
            return (
              <button key={source.id} disabled={isAttached} onClick={() => onAttach(source)}>
                <Icon /><span><strong>{source.title}</strong><small>{source.description}</small></span><em>{isAttached ? "Добавлен" : "Добавить"}</em>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
