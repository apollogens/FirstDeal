"use client";

import { useActionMenu } from "@/components/useActionMenu";
import { useDialogFocus } from "@/components/useDialogFocus";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronRight,
  Download,
  Eye,
  FileImage,
  FileSpreadsheet,
  FileText,
  Files,
  Filter,
  Folder,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Presentation,
  Scale,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  DOCUMENT_FILE_ACCEPT,
  DOCUMENT_MAX_FILE_SIZE,
  type DocumentRecord,
  type DocumentScope,
  DocumentsApiError,
  deleteDocument,
  documentDownloadUrl,
  documentPreviewUrl,
  getDocuments,
  searchDocuments,
  uploadDocument,
} from "@/lib/documents";
import { normalizeDocument, extensionOf, formatFileSize } from "./adapters/documentViewModel";
import type { DocumentCategory, DocumentImportance, DocumentViewModel, RelatedItem } from "./types";
import s from "./DocumentsV2.module.css";

type ScopeFilter = DocumentScope | "";
const subscribeCompactPanel = (callback: () => void) => {
  const media = window.matchMedia("(max-width: 900px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
type FileTypeFilter = "" | "PDF" | "DOCX" | "XLSX" | "TXT";
type ImportanceFilter = "" | "important" | "critical";

const categories: Array<{ id: DocumentCategory; label: string; short: string; icon: typeof FileText }> = [
  { id: "contracts", label: "Договоры и контракты", short: "Договоры", icon: FileText },
  { id: "finance", label: "Финансы", short: "Финансы", icon: BarChart3 },
  { id: "reports", label: "Отчёты и аналитика", short: "Отчёты", icon: Presentation },
  { id: "work", label: "Рабочие материалы", short: "Рабочее", icon: Folder },
  { id: "legal", label: "Юридические", short: "Юридические", icon: Scale },
  { id: "instructions", label: "Инструкции", short: "Инструкции", icon: Files },
  { id: "presentations", label: "Презентации", short: "Презентации", icon: Presentation },
  { id: "education", label: "Учебные материалы", short: "Обучение", icon: Files },
  { id: "research", label: "Исследования", short: "Исследования", icon: Search },
  { id: "other", label: "Прочее", short: "Прочее", icon: MoreHorizontal },
];
const visibleCategories = categories.slice(0, 4);
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

function scopeLabel(scope: DocumentScope) {
  return scope === "work" ? "Рабочее" : "Личное";
}

function statusPresentation(status: string) {
  if (status === "ready") return { label: "Готов", tone: "success" };
  if (status === "processing" || status === "uploaded") return { label: "Обрабатывается", tone: "processing" };
  if (status === "error") return { label: "Ошибка обработки", tone: "error" };
  return { label: status, tone: "neutral" };
}

function categoryLabel(category: DocumentCategory | null) {
  return categories.find((item) => item.id === category)?.label ?? "Не определена";
}

function FileGlyph({ filename }: { filename: string }) {
  const extension = extensionOf(filename);
  const Icon = extension === "xlsx" ? FileSpreadsheet : ["png", "jpg", "jpeg", "webp"].includes(extension) ? FileImage : FileText;
  const tone = extension === "pdf" ? "pdf" : extension === "xlsx" ? "sheet" : extension === "doc" || extension === "docx" ? "doc" : "file";
  return <Icon className={s[`glyph--${tone}`]} aria-hidden="true" />;
}

function StatusBadge({ status }: { status: string }) {
  const item = statusPresentation(status);
  return <span className={`${s.status} ${s[`status--${item.tone}`]}`}><i />{item.label}</span>;
}

function ImportanceBadge({ importance }: { importance: DocumentImportance }) {
  if (importance !== "critical" && importance !== "important") return null;
  return <span className={`${s.importance} ${s[`importance--${importance}`]}`}><i />{importance === "critical" ? "Критично" : "Важно"}</span>;
}

export function DocumentsV2({ onMenu, onAnalyze }: { onMenu: () => void; onAnalyze: (document: DocumentRecord) => void }) {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("document") ?? "";
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("");
  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [fileType, setFileType] = useState<FileTypeFilter>("");
  const [importance, setImportance] = useState<ImportanceFilter>("");
  const [query, setQuery] = useState("");
  const [searchIds, setSearchIds] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewer, setViewer] = useState<DocumentRecord | null>(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError("");
    try {
      const next = await getDocuments("", signal);
      setRecords(next);
      setSelectedId((current) => {
        if (next.some((item) => item.id === requestedId)) return requestedId;
        if (next.some((item) => item.id === current)) return current;
        return window.matchMedia("(min-width: 901px)").matches ? next[0]?.id ?? "" : "";
      });
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof DocumentsApiError && error.status === 401) {
        window.location.replace("/login?next=%2Fworkspace");
        return;
      }
      setLoadError("Не удалось загрузить документы.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [requestedId]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const documents = useMemo(() => records.map(normalizeDocument), [records]);
  const selected = documents.find((item) => item.id === selectedId) ?? null;
  const counts = useMemo(() => new Map(categories.map((item) => [item.id, documents.filter((document) => document.category === item.id).length])), [documents]);
  const filtered = useMemo(() => documents.filter((document) => {
    if (scope && document.scope !== scope) return false;
    if (category && document.category !== category) return false;
    if (fileType && document.fileType !== fileType) return false;
    if (importance && document.importance !== importance) return false;
    if (searchIds && !searchIds.has(document.id)) return false;
    return true;
  }), [documents, scope, category, fileType, importance, searchIds]);
  const highlights = documents.filter((document) => document.importance === "critical" || document.importance === "important").slice(0, 3);

  async function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text) {
      setSearchIds(null);
      setSearchError("");
      return;
    }
    setSearching(true);
    setSearchError("");
    try {
      const results = await searchDocuments(text, scope);
      setSearchIds(new Set(results.map((item) => item.document_id)));
    } catch (error) {
      if (error instanceof DocumentsApiError && error.status === 401) {
        window.location.replace("/login?next=%2Fworkspace");
        return;
      }
      setSearchError(error instanceof Error ? error.message : "Не удалось выполнить поиск.");
    } finally {
      setSearching(false);
    }
  }

  async function removeDocument(document: DocumentRecord) {
    if (deletingId || !window.confirm(`Удалить «${document.filename}»? Это действие нельзя отменить.`)) return;
    setDeletingId(document.id);
    try {
      await deleteDocument(document.id);
      setRecords((current) => current.filter((item) => item.id !== document.id));
      setSelectedId((current) => current === document.id ? "" : current);
      setRowMenu("");
      setToast("Документ удалён");
    } catch (error) {
      if (error instanceof DocumentsApiError && error.status === 401) {
        window.location.replace("/login?next=%2Fworkspace");
        return;
      }
      if (error instanceof DocumentsApiError && error.status === 404) {
        setRecords((current) => current.filter((item) => item.id !== document.id));
        setSelectedId((current) => current === document.id ? "" : current);
        setRowMenu("");
        setToast("Документ уже удалён");
        return;
      }
      setToast(error instanceof Error ? error.message : "Не удалось удалить документ");
    } finally {
      setDeletingId("");
    }
  }

  function chooseCategory(next: DocumentCategory | "") {
    setCategory(next);
    setCategoryMenuOpen(false);
  }

  return (
    <main className={`${s.root} ${selected ? s["root--panel"] : ""}`}>
      <section className={s.workspace}>
        <header className={s.header}>
          <button className={s.mobileMenu} aria-label="Открыть меню" onClick={onMenu}><Menu /></button>
          <div><h1>Документы</h1><p>Файлы, документы и знания рабочего пространства</p></div>
          <button className={s.primary} onClick={() => setUploadOpen(true)}><Upload />Загрузить документ</button>
        </header>

        <div className={s.searchRow}>
          <form className={s.search} onSubmit={(event) => { void submitSearch(event); }}>
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => { setQuery(event.target.value); if (!event.target.value) setSearchIds(null); }} placeholder="Поиск по документам и содержимому…" aria-label="Поиск по документам и содержимому" />
            {query && <button type="button" aria-label="Очистить поиск" onClick={() => { setQuery(""); setSearchIds(null); }}><X /></button>}
            <button className={s.searchSubmit} type="submit" disabled={searching}>{searching ? "Ищем…" : "Найти"}</button>
          </form>
          <div className={s.popoverWrap}>
            <button className={`${s.secondary} ${filtersOpen ? s.activeControl : ""}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><Filter />Фильтры</button>
            {filtersOpen && <FiltersPopover scope={scope} fileType={fileType} importance={importance} onScope={setScope} onFileType={setFileType} onImportance={setImportance} onClose={() => setFiltersOpen(false)} />}
          </div>
        </div>
        {searchError && <p className={s.inlineError} role="alert">{searchError}</p>}

        <nav className={s.chips} aria-label="Категории документов">
          <button className={!category ? s.chipActive : ""} onClick={() => chooseCategory("")}>Все</button>
          {categories.slice(0, 7).map((item) => <button key={item.id} className={category === item.id ? s.chipActive : ""} onClick={() => chooseCategory(item.id)}>{item.short}</button>)}
          <button className={category && categories.slice(7).some((item) => item.id === category) ? s.chipActive : ""} onClick={() => setCategoryMenuOpen(true)}>Прочее</button>
        </nav>

        <section className={s.categorySection}>
          <div className={s.sectionHeading}><h2>Категории</h2><button onClick={() => setCategoryMenuOpen(true)}>Смотреть все <ChevronRight /></button></div>
          <div className={s.categoryGrid}>
            {visibleCategories.map((item, index) => <CategoryCard key={item.id} item={item} count={counts.get(item.id) ?? 0} active={category === item.id} index={index} onClick={() => chooseCategory(item.id)} />)}
            <div className={s.popoverWrap}>
              <CategoryCard item={categories.at(-1)!} count={counts.get("other") ?? 0} active={category === "other"} index={4} onClick={() => setCategoryMenuOpen((value) => !value)} />
              {categoryMenuOpen && <CategoryPopover active={category} counts={counts} onSelect={chooseCategory} onClose={() => setCategoryMenuOpen(false)} />}
            </div>
          </div>
        </section>

        <section className={s.highlights}>
          <h2><Sparkles />Assistant подметил</h2>
          {highlights.length ? <div className={s.highlightGrid}>{highlights.map((document) => <button key={document.id} onClick={() => setSelectedId(document.id)}><span className={s.fileIcon}><FileGlyph filename={document.filename} /></span><span><strong>{document.filename}</strong><small>{document.importanceReason}</small></span><ImportanceBadge importance={document.importance} /><ChevronRight /></button>)}</div> : <p className={s.honestState}>Важные документы появятся здесь после анализа Assistant.</p>}
        </section>

        <section className={s.listSection}>
          <h2>Последние документы</h2>
          {loadError ? <EmptyState title="Не удалось загрузить документы" text="Проверьте соединение и попробуйте снова." action={<button className={s.secondary} onClick={() => void load()}>Повторить</button>} /> : loading ? <DocumentSkeleton /> : filtered.length ? <div className={s.documentList}>
            <div className={s.listHeader}><span>Документ</span><span>Категория</span><span>Важность</span><span>Размер</span><span>Дата изменения</span><span /></div>
            {filtered.map((document) => <DocumentRow key={document.id} document={document} selected={selectedId === document.id} menuOpen={rowMenu === document.id} onSelect={() => setSelectedId(document.id)} onMenu={() => setRowMenu((current) => current === document.id ? "" : document.id)} onPreview={() => setViewer(document.source)} onDelete={() => void removeDocument(document.source)} />)}
          </div> : <EmptyState title={documents.length ? "Ничего не найдено" : "Здесь пока нет документов"} text={documents.length ? "Попробуйте изменить запрос или фильтры." : "Загрузите первый файл, чтобы Assistant мог помочь с его содержанием."} action={!documents.length ? <button className={s.primary} onClick={() => setUploadOpen(true)}><Upload />Загрузить документ</button> : undefined} />}
        </section>
      </section>

      {selected && <DocumentPanel document={selected} overlayOpen={Boolean(viewer) || uploadOpen} deleting={deletingId === selected.id} onClose={() => setSelectedId("")} onAnalyze={() => onAnalyze(selected.source)} onPreview={() => setViewer(selected.source)} onDelete={() => void removeDocument(selected.source)} />}
      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} onUploaded={(document) => { setRecords((current) => [document, ...current.filter((item) => item.id !== document.id)]); setSelectedId(document.id); setUploadOpen(false); setToast("Документ загружен"); }} />}
      {viewer && <DocumentViewer document={viewer} onClose={() => setViewer(null)} onAnalyze={() => onAnalyze(viewer)} />}
      {toast && <div className={s.toast} role="status">{toast}</div>}
    </main>
  );
}

function CategoryCard({ item, count, active, index, onClick }: { item: (typeof categories)[number]; count: number; active: boolean; index: number; onClick: () => void }) {
  const Icon = item.icon;
  return <button className={`${s.categoryCard} ${s[`categoryCard--${index}`]} ${active ? s.categoryCardActive : ""}`} onClick={onClick}><span><Icon /></span><strong>{item.label}</strong><small>{count} {count === 1 ? "документ" : count > 1 && count < 5 ? "документа" : "документов"}</small></button>;
}

function CategoryPopover({ active, counts, onSelect, onClose }: { active: DocumentCategory | ""; counts: Map<DocumentCategory, number>; onSelect: (value: DocumentCategory | "") => void; onClose: () => void }) {
  return <div className={`${s.popover} ${s.categoryPopover}`} role="dialog" aria-label="Все категории"><header><strong>Все категории</strong><button aria-label="Закрыть" onClick={onClose}><X /></button></header><button className={!active ? s.popoverActive : ""} onClick={() => onSelect("")}><span>Все документы</span></button>{categories.map((item) => <button key={item.id} className={active === item.id ? s.popoverActive : ""} onClick={() => onSelect(item.id)}><span>{item.label}</span><small>{counts.get(item.id) ?? 0}</small></button>)}</div>;
}

function FiltersPopover({ scope, fileType, importance, onScope, onFileType, onImportance, onClose }: { scope: ScopeFilter; fileType: FileTypeFilter; importance: ImportanceFilter; onScope: (v: ScopeFilter) => void; onFileType: (v: FileTypeFilter) => void; onImportance: (v: ImportanceFilter) => void; onClose: () => void }) {
  return <div className={`${s.popover} ${s.filtersPopover}`} role="dialog" aria-label="Фильтры документов"><header><strong>Фильтры</strong><button aria-label="Закрыть" onClick={onClose}><X /></button></header><FilterGroup title="Область" value={scope} values={[["", "Все"], ["personal", "Личное"], ["work", "Рабочее"]]} onChange={(v) => onScope(v as ScopeFilter)} /><FilterGroup title="Тип файла" value={fileType} values={[["", "Все"], ["PDF", "PDF"], ["DOCX", "DOCX"], ["XLSX", "XLSX"], ["TXT", "TXT"]]} onChange={(v) => onFileType(v as FileTypeFilter)} /><FilterGroup title="Важность" value={importance} values={[["", "Все"], ["important", "Важные"], ["critical", "Критичные"]]} onChange={(v) => onImportance(v as ImportanceFilter)} /><button className={s.resetFilters} onClick={() => { onScope(""); onFileType(""); onImportance(""); }}>Сбросить фильтры</button></div>;
}

function FilterGroup({ title, value, values, onChange }: { title: string; value: string; values: string[][]; onChange: (value: string) => void }) {
  return <fieldset className={s.filterGroup}><legend>{title}</legend><div>{values.map(([id, label]) => <button type="button" key={id} className={value === id ? s.filterActive : ""} onClick={() => onChange(id)}>{label}</button>)}</div></fieldset>;
}

function DocumentRow({ document, selected, menuOpen, onSelect, onMenu, onPreview, onDelete }: { document: DocumentViewModel; selected: boolean; menuOpen: boolean; onSelect: () => void; onMenu: () => void; onPreview: () => void; onDelete: () => void }) {
  const menuRoot = useRef<HTMLSpanElement>(null);
  useActionMenu(menuOpen, menuRoot, onMenu);
  return <div className={`${s.documentRow} ${selected ? s.documentRowSelected : ""}`} role="button" tabIndex={0} aria-pressed={selected} onClick={onSelect} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}>
    <span className={s.documentIdentity}><span className={s.fileIcon}><FileGlyph filename={document.filename} /></span><span><strong title={document.filename}>{document.filename}</strong><small>{statusPresentation(document.status).label}</small></span></span>
    <span>{document.category ? <em className={s.categoryBadge}>{categoryLabel(document.category)}</em> : <span className={s.muted}>Не определена</span>}</span>
    <span><ImportanceBadge importance={document.importance} /></span>
    <span className={s.meta}>{document.fileSize}</span>
    <span className={s.meta}>{document.createdAt ? shortDateFormatter.format(document.createdAt) : "—"}</span>
    <span ref={menuRoot} className={s.rowMenuWrap}><button className={s.iconButton} aria-label={`Действия с ${document.filename}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); onMenu(); }}><MoreHorizontal /></button>{menuOpen && <span data-anchored-popover role="menu" className={s.rowMenu} onClick={(event) => event.stopPropagation()}><button role="menuitem" onClick={onPreview}><Eye />Просмотреть</button><a role="menuitem" href={documentDownloadUrl(document.id)} download><Download />Скачать</a><button role="menuitem" className={s.dangerItem} onClick={onDelete}><Trash2 />Удалить</button></span>}</span>
  </div>;
}

function DocumentPanel({ document, overlayOpen, deleting, onClose, onAnalyze, onPreview, onDelete }: { document: DocumentViewModel; overlayOpen: boolean; deleting: boolean; onClose: () => void; onAnalyze: () => void; onPreview: () => void; onDelete: () => void }) {
  const compact = useSyncExternalStore(subscribeCompactPanel, () => window.matchMedia("(max-width: 900px)").matches, () => false);
  useDialogFocus(compact, '[data-document-panel]', onClose, undefined, true);
  const insights = document.insights;
  const chips = [insights?.obligationsCount !== undefined ? `${insights.obligationsCount} обязательств` : null, insights?.deadlinesCount !== undefined ? `${insights.deadlinesCount} дедлайнов` : null, insights?.hasFinancialTerms ? "Есть денежные условия" : null].filter(Boolean);
  return <aside className={s.panel} data-document-panel inert={compact && overlayOpen} aria-hidden={compact && overlayOpen ? true : undefined} role={compact && !overlayOpen ? "dialog" : undefined} aria-modal={compact && !overlayOpen ? true : undefined} aria-label="Сведения о документе">
    <header><h2>Документ</h2><button aria-label="Закрыть сведения" onClick={onClose}><X /></button></header>
    <div className={s.panelScroll}>
      <div className={s.documentLead}><span className={s.largeFileIcon}><FileGlyph filename={document.filename} /></span><div><strong>{document.filename}</strong><p>{document.fileType} · {document.fileSize}</p><div>{document.category && <span className={s.categoryBadge}>{categoryLabel(document.category)}</span>}<ImportanceBadge importance={document.importance} /></div></div></div>
      <button className={s.analyzeButton} onClick={onAnalyze}><MessageSquareText />Анализировать с Assistant</button>
      <div className={s.panelActionGrid}><button role="menuitem" onClick={onPreview}><Eye />Просмотреть</button><a role="menuitem" href={documentDownloadUrl(document.id)} download><Download />Скачать</a></div>
      <PanelSection icon={Sparkles} title="Сводка ассистента"><p className={s.pendingText}>{document.summary ?? (document.status === "processing" || document.status === "uploaded" ? "Assistant изучает документ…" : "Сводка ассистента появится после анализа документа.")}</p>{chips.length > 0 && <div className={s.factChips}>{chips.map((chip) => <span key={chip}>{chip}</span>)}</div>}</PanelSection>
      {(document.importance === "critical" || document.importance === "important" || document.importanceReason) && <PanelSection icon={Sparkles} title="Почему это важно"><div className={s.importanceBox}><ImportanceBadge importance={document.importance} />{document.importanceReason ? <p>{document.importanceReason}</p> : <p>Объяснение появится после анализа документа.</p>}</div></PanelSection>}
      <PanelSection icon={FileText} title="Основное"><dl className={s.details}><Detail label="Категория" value={categoryLabel(document.category)} /><Detail label="Область" value={scopeLabel(document.scope)} /><Detail label="Тип" value={document.fileType} /><Detail label="Размер" value={document.fileSize} /><Detail label="Статус" value={<StatusBadge status={document.status} />} />{document.pagesCount !== null && <Detail label="Страницы" value={String(document.pagesCount)} />}{document.createdAt && <Detail label="Дата загрузки" value={`${dateFormatter.format(document.createdAt)} · ${timeFormatter.format(document.createdAt)}`} />}</dl></PanelSection>
      {document.relatedItems.length > 0 && <PanelSection icon={BriefcaseBusiness} title="Связано"><div className={s.relatedList}>{document.relatedItems.map((item) => <RelatedRow key={`${item.type}-${item.id}`} item={item} />)}</div></PanelSection>}
      <button className={s.deleteButton} disabled={deleting} onClick={onDelete}><Trash2 />{deleting ? "Удаление…" : "Удалить документ"}</button>
    </div>
  </aside>;
}

function PanelSection({ icon: Icon, title, children }: { icon: typeof FileText; title: string; children: React.ReactNode }) {
  return <section className={s.panelSection}><h3><Icon />{title}</h3>{children}</section>;
}
function Detail({ label, value }: { label: string; value: React.ReactNode }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function RelatedRow({ item }: { item: RelatedItem }) { const content = <><span><strong>{item.title}</strong><small>{item.subtitle ?? item.type}</small></span><ChevronRight /></>; return item.href ? <a href={item.href}>{content}</a> : <div aria-disabled="true">{content}</div>; }

function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) { return <div className={s.empty}><span><Files /></span><h3>{title}</h3><p>{text}</p>{action}</div>; }
function DocumentSkeleton() { return <div className={s.skeleton} aria-label="Загрузка документов">{Array.from({ length: 5 }, (_, index) => <div key={index}><i /><span /><span /><span /></div>)}</div>; }

function DocumentViewer({ document, onClose, onAnalyze }: { document: DocumentRecord; onClose: () => void; onAnalyze: () => void }) {
  useDialogFocus(true, '[aria-labelledby="viewer-title"]', onClose);
  const previewable = document.mime_type === "application/pdf" || document.mime_type.startsWith("image/");
  return <div className={s.viewerBackdrop}><section className={s.viewer} role="dialog" aria-modal="true" aria-labelledby="viewer-title"><header><div><h2 id="viewer-title" title={document.filename}>{document.filename}</h2><p>{formatFileSize(document.file_size)}</p></div><button aria-label="Закрыть просмотр" onClick={onClose}><X /></button></header><div className={s.viewerBody}>{previewable ? <iframe title={`Просмотр ${document.filename}`} src={documentPreviewUrl(document.id)} /> : <div className={s.previewEmpty}><FileText /><h3>Предпросмотр этого формата недоступен</h3><p>Файл можно скачать или передать в контекст Assistant.</p></div>}</div><footer><button className={s.secondary} onClick={onClose}>Назад</button><a className={s.secondary} href={documentDownloadUrl(document.id)} download><Download />Скачать</a><button className={s.primary} onClick={onAnalyze}><MessageSquareText />Анализировать с Assistant</button></footer></section></div>;
}

function UploadDialog({ onClose, onUploaded }: { onClose: () => void; onUploaded: (document: DocumentRecord) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [scope, setScope] = useState<DocumentScope>("work");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  useDialogFocus(true, '[aria-labelledby="upload-document-title"]', () => { if (!uploading) onClose(); });
  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  function choose(next: File | undefined) {
    if (!next) return;
    const accepted = DOCUMENT_FILE_ACCEPT.split(",").map((item) => item.slice(1));
    if (!accepted.includes(extensionOf(next.name))) { setError("Формат файла не поддерживается."); setFile(null); return; }
    if (next.size > DOCUMENT_MAX_FILE_SIZE) { setError("Файл превышает максимальный размер 50 МБ."); setFile(null); return; }
    setFile(next); setError("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || uploading) return;
    setUploading(true); setError("");
    try { onUploaded(await uploadDocument(file, scope)); } catch (reason) { if (reason instanceof DocumentsApiError && reason.status === 401) window.location.replace("/login?next=%2Fworkspace"); else setError(reason instanceof Error ? reason.message : "Не удалось загрузить документ."); } finally { setUploading(false); }
  }
  return <dialog ref={dialogRef} aria-labelledby="upload-document-title" className={s.uploadDialog} onCancel={(event) => { event.preventDefault(); if (!uploading) onClose(); }}><header><div><span><Upload /></span><div><h2 id="upload-document-title">Загрузить документ</h2><p>Добавьте файл с компьютера, чтобы продолжить</p></div></div><button aria-label="Закрыть" disabled={uploading} onClick={onClose}><X /></button></header><form onSubmit={(event) => { void submit(event); }}><input ref={inputRef} type="file" accept={DOCUMENT_FILE_ACCEPT} hidden onChange={(event) => choose(event.target.files?.[0])} /><button type="button" className={s.dropZone} onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); }}><span><Upload /></span><strong>{file ? file.name : "Перетащите файл сюда"}</strong><p>{file ? formatFileSize(file.size) : "или выберите на компьютере"}</p></button><div className={s.uploadScope}><span>Область</span><div><button type="button" className={scope === "personal" ? s.filterActive : ""} onClick={() => setScope("personal")}>Личное</button><button type="button" className={scope === "work" ? s.filterActive : ""} onClick={() => setScope("work")}>Рабочее</button></div></div>{error && <p className={s.inlineError} role="alert">{error}</p>}<footer><button type="button" className={s.secondary} disabled={uploading} onClick={onClose}>Отмена</button><button type="submit" className={s.primary} disabled={!file || uploading}>{uploading ? "Загрузка…" : "Загрузить"}</button></footer></form></dialog>;
}
