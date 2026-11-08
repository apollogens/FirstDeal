import { useDialogFocus } from "./useDialogFocus";
import {

  ArrowRight,

  Brain,

  CalendarDays,

  ChevronDown,

  FileCode2,

  FileSpreadsheet,

  FileText,

  Paperclip,

  Wallet,

  X,

} from "lucide-react";

import { RefObject, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type FocusEvent } from "react";

import { suggestions, type QuickTab, type Source } from "@/lib/demo";

import type { DocumentRecord } from "@/lib/documents";

import type { SourceCategory } from "./Sources";

import s from "./Workspace.module.css";


export type TextAttachment = {

  id: string;

  name: string;

  content: string;

  size: number;

};


export type FileAttachment = {

  id: string;

  name: string;

  size: number;

  status: "selected" | "uploading" | "ready" | "error";

  documentId?: string;

  error?: string;

};


const MAX_DOCUMENT_ATTACHMENTS = 10;


const LARGE_PASTE_CHARACTERS = 4_000;

const LARGE_PASTE_LINES = 30;


function formatBytes(bytes: number) {

  if (bytes < 1_024) return `${bytes} Б`;

  return `${(bytes / 1_024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} КБ`;

}


function attachmentVisual(name: string) {

  const extension = name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") return { Icon: FileText, tone: "pdf" } as const;

  if (extension === "xlsx" || extension === "xls" || extension === "csv") return { Icon: FileSpreadsheet, tone: "sheet" } as const;

  return { Icon: FileText, tone: "document" } as const;

}


const QUICK_TABS: ReadonlyArray<{
  name: QuickTab;
  category: SourceCategory;
  icon: typeof Wallet;
}> = [
  { name: "Финансы", category: "finance", icon: Wallet },
  { name: "Календарь", category: "calendar", icon: CalendarDays },
  { name: "Документы", category: "document", icon: FileText },
  { name: "Память", category: "memory", icon: Brain },
];

export function ChatComposer({

  value,

  onChange,

  onSend,

  sources,

  onRemoveSource,

  fileAttachments,

  documents,

  documentsLoading,

  documentsError,

  onRefreshDocuments,

  onSelectDocument,

  fileAccept,

  onSelectFile,

  onRemoveFileAttachment,

  textAttachments,

  onAddTextAttachment,

  onRemoveTextAttachment,

  inputRef,

  disabled = false,

  sendDisabled = false,

}: {

  value: string;

  onChange: (v: string) => void;

  onSend: () => void;

  sources: Source[];

  onRemoveSource: (source: Source) => void;

  fileAttachments: FileAttachment[];

  documents: DocumentRecord[];

  documentsLoading: boolean;

  documentsError: string;

  onRefreshDocuments: () => void;

  onSelectDocument: (document: DocumentRecord) => void;

  fileAccept: string;

  onSelectFile: (file: File) => void;

  onRemoveFileAttachment: (id: string) => void;

  textAttachments: TextAttachment[];

  onAddTextAttachment: (attachment: TextAttachment) => void;

  onRemoveTextAttachment: (id: string) => void;

  inputRef: RefObject<HTMLTextAreaElement | null>;

  disabled?: boolean;

  sendDisabled?: boolean;

}) {

  const [modelOpen, setModelOpen] = useState(false);

  const [documentsOpen, setDocumentsOpen] = useState(false);

  const [preview, setPreview] = useState<TextAttachment | null>(null);
  useDialogFocus(Boolean(preview), '[aria-labelledby="paste-preview-title"]', () => setPreview(null));

  const fileInputRef = useRef<HTMLInputElement>(null);

  const documentsButtonRef = useRef<HTMLButtonElement>(null);

  const documentsPickerRef = useRef<HTMLDivElement>(null);


  useEffect(() => {

    if (!documentsOpen) return;


    function handlePointerDown(event: PointerEvent) {

      const target = event.target;

      if (!(target instanceof Node)) return;

      if (documentsButtonRef.current?.contains(target) || documentsPickerRef.current?.contains(target)) return;

      setDocumentsOpen(false);

    }


    function handleKeyDown(event: KeyboardEvent) {

      if (event.key !== "Escape") return;

      event.preventDefault();

      setDocumentsOpen(false);

      documentsButtonRef.current?.focus();

    }


    window.addEventListener("pointerdown", handlePointerDown);

    window.addEventListener("keydown", handleKeyDown);

    return () => {

      window.removeEventListener("pointerdown", handlePointerDown);

      window.removeEventListener("keydown", handleKeyDown);

    };

  }, [documentsOpen]);


  useLayoutEffect(() => {

    const textarea = inputRef.current;

    if (!textarea) return;

    textarea.style.height = "auto";

    const maxHeight = 168;

    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;

    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";

  }, [inputRef, value]);


  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {

    const text = event.clipboardData.getData("text/plain");

    if (text.length < LARGE_PASTE_CHARACTERS && text.split(/\r?\n/).length < LARGE_PASTE_LINES) return;

    event.preventDefault();

    const size = new Blob([text]).size;

    onAddTextAttachment({

      id: crypto.randomUUID(),

      name: `Вставленный текст ${textAttachments.length + 1}.md`,

      content: text,

      size,

    });

  }


  return (

    <div className={s.workspace__composer}>

      <input

        ref={fileInputRef}

        className={s.workspace__fileInput}

        type="file"

        accept={fileAccept}

        disabled={disabled || fileAttachments.length >= MAX_DOCUMENT_ATTACHMENTS}

        onChange={(event) => {

          const file = event.target.files?.[0];

          if (file) onSelectFile(file);

          event.target.value = "";

        }}

      />

      {fileAttachments.length > 0 && (

        <div className={s.workspace__textAttachments} aria-label="Файловые вложения">

          {fileAttachments.map((attachment) => (

            <div className={`${s.workspace__textAttachment} ${attachment.status === "error" ? s["workspace__textAttachment--error"] : ""}`} key={attachment.id}>

              <div className={s.workspace__fileAttachmentBody} title={attachment.name}>

                {(() => {

                  const { Icon, tone } = attachmentVisual(attachment.name);

                  return <span className={`${s.workspace__attachmentIcon} ${s[`workspace__attachmentIcon--${tone}`]}`}><Icon /></span>;

                })()}

                <span>

                  <strong>{attachment.name}</strong>

                  <small>{attachment.status === "uploading" || attachment.status === "selected" ? "Документ обрабатывается" : attachment.status === "error" ? attachment.error : formatBytes(attachment.size)}</small>

                </span>

              </div>

              <button type="button" aria-label={`Удалить ${attachment.name}`} onClick={() => onRemoveFileAttachment(attachment.id)}><X /></button>

            </div>

          ))}

        </div>

      )}

      {textAttachments.length > 0 && (

        <div className={s.workspace__textAttachments} aria-label="Текстовые вложения">

          {textAttachments.map((attachment) => (

            <div className={s.workspace__textAttachment} key={attachment.id}>

              <button type="button" onClick={() => setPreview(attachment)} title="Просмотреть текст">

                <FileCode2 />

                <span><strong>{attachment.name}</strong><small>{formatBytes(attachment.size)}</small></span>

              </button>

              <button type="button" aria-label={`Удалить ${attachment.name}`} onClick={() => onRemoveTextAttachment(attachment.id)}><X /></button>

            </div>

          ))}

        </div>

      )}

      <textarea

        ref={inputRef}

        aria-label="Сообщение"

        placeholder="Что сделать? Например, проанализируй этот договор, дай рекомендации, создай презентацию..."

        value={value}

        disabled={disabled}

        onChange={(e) => onChange(e.target.value)}

        onPaste={handlePaste}

        onKeyDown={(e) => {

          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {

            e.preventDefault();

            setDocumentsOpen(false);

            setModelOpen(false);

            onSend();

          }

        }}

      />

      <div className={s.workspace__composerBottom}>

        <button

          ref={documentsButtonRef}

          type="button"

          aria-label="Выбрать документы"

          aria-expanded={documentsOpen}

          aria-controls="composer-document-picker"

          aria-haspopup="dialog"

          disabled={disabled}

          onClick={() => {

            const nextOpen = !documentsOpen;

            setDocumentsOpen(nextOpen);

            if (nextOpen) {

              setModelOpen(false);

              onRefreshDocuments();

            }

          }}

        >

          <Paperclip />

        </button>

        {documentsOpen && (

          <div ref={documentsPickerRef} id="composer-document-picker" className={s.workspace__documentPicker} role="dialog" aria-label="Документы для сообщения">

            <header>

              <strong>Добавить документы</strong>

              <span>{fileAttachments.length}/{MAX_DOCUMENT_ATTACHMENTS}</span>

              <button type="button" aria-label="Закрыть меню документов" onClick={() => { setDocumentsOpen(false); documentsButtonRef.current?.focus(); }}><X /></button>

            </header>

            <div className={s.workspace__documentPickerList}>

              {documentsLoading ? <p>Загружаем документы…</p> : documentsError ? <p role="alert">{documentsError}</p> : documents.length === 0 ? <p>Загруженных документов пока нет.</p> : documents.map((document) => {

                const selected = fileAttachments.some((attachment) => attachment.documentId === document.id);

                const unavailable = document.status !== "ready";

                const { Icon, tone } = attachmentVisual(document.filename);

                return (

                  <button

                    type="button"

                    key={document.id}

                    disabled={selected || unavailable || fileAttachments.length >= MAX_DOCUMENT_ATTACHMENTS}

                    onClick={() => {

                      onSelectDocument(document);

                      setDocumentsOpen(false);

                      inputRef.current?.focus();

                    }}

                  >

                    <span className={`${s.workspace__attachmentIcon} ${s[`workspace__attachmentIcon--${tone}`]}`}><Icon /></span>

                    <span><strong>{document.filename}</strong><small>{document.status === "ready" ? `${formatBytes(document.file_size)} · ${document.scope === "work" ? "Рабочее" : "Личное"}` : document.status === "error" ? document.error_message || "Ошибка обработки" : "Документ обрабатывается"}</small></span>

                    <em>{selected ? "Добавлен" : document.status === "ready" ? "Добавить" : "Недоступен"}</em>

                  </button>

                );

              })}

            </div>

            <button className={s.workspace__documentUpload} type="button" disabled={fileAttachments.length >= MAX_DOCUMENT_ATTACHMENTS} onClick={() => { setDocumentsOpen(false); fileInputRef.current?.click(); }}>

              <Paperclip /> Загрузить новый документ

            </button>

          </div>

        )}

        <div className={s.workspace__composerSources}>

          {sources.slice(0, 2).map((source) => (

            <span className={s.workspace__chip} key={source.id} title={source.title}>

              <FileText aria-hidden="true" />

              <span>{source.title}</span>

              <button aria-label={`Удалить ${source.title} из контекста`} onClick={() => onRemoveSource(source)}><X /></button>

            </span>

          ))}

          {sources.length > 2 && <span className={s.workspace__chipMore}>+{sources.length - 2}</span>}

        </div>

        <div className={s.workspace__modelWrap}>

          <button

            className={s.workspace__model}

            aria-expanded={modelOpen}

            onClick={() => {

              setDocumentsOpen(false);

              setModelOpen(!modelOpen);

            }}

          >

            Assistant

            <ChevronDown />

          </button>

          {modelOpen && (

            <div className={s.workspace__modelMenu}>

              Assistant · demo

              <br />

              <small>AI пока не подключён</small>

            </div>

          )}

        </div>

        <button

          className={s.workspace__send}

          aria-label="Отправить сообщение"

          onClick={() => {

            setDocumentsOpen(false);

            setModelOpen(false);

            onSend();

          }}

          disabled={disabled || sendDisabled}

        >

          <ArrowRight />

        </button>

      </div>

      {preview && (

        <div className={s.workspace__pastePreviewBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>

          <section className={s.workspace__pastePreview} role="dialog" aria-modal="true" aria-labelledby="paste-preview-title">

            <header><div><h2 id="paste-preview-title">{preview.name}</h2><p>{formatBytes(preview.size)}</p></div><button type="button" aria-label="Закрыть просмотр" onClick={() => setPreview(null)}><X /></button></header>

            <pre>{preview.content}</pre>

          </section>

        </div>

      )}

    </div>

  );

}

export function ContextQuickActions({
  onOpen,
  onSelect,
}: {
  onOpen: (category: SourceCategory) => void;
  onSelect: (value: string) => void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [tab, setTab] = useState<QuickTab | null>(null);

  function handleBlur(event: FocusEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget as Node | null;
    if (!event.currentTarget.contains(nextTarget)) setTab(null);
  }

  return (
    <section
      className={s.workspace__quickActions}
      aria-label="Добавить контекст"
      onPointerLeave={() => setTab(null)}
      onBlur={handleBlur}
    >
      <div className={s.workspace__tabs} role="group" aria-label="Быстрые действия">
        {QUICK_TABS.map(({ name, category, icon: Icon }, index) => (
          <button
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            aria-expanded={tab === name}
            className={tab === name ? s["workspace__tab--active"] : undefined}
            onPointerEnter={() => setTab(name)}
            onFocus={() => setTab(name)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

              event.preventDefault();
              const direction = event.key === "ArrowRight" ? 1 : -1;
              const next = (index + direction + QUICK_TABS.length) % QUICK_TABS.length;

              buttons.current[next]?.focus();
              setTab(QUICK_TABS[next].name);
            }}
            onClick={() => {
              onOpen(category);
              setTab(null);
            }}
            key={name}
          >
            <Icon aria-hidden="true" />
            <span>{name}</span>
          </button>
        ))}
      </div>

      <div
        className={`${s.workspace__suggestions} ${tab ? s["workspace__suggestions--open"] : ""}`}
        aria-hidden={!tab}
      >
        {(tab ? suggestions[tab] : []).map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => {
              onSelect(text);
              setTab(null);
            }}
          >
            <span>{text}</span>
            <ArrowRight aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
