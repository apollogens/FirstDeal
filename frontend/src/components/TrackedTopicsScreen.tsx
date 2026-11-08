"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from "react";
import { Brain, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, FileText, FolderOpen, Lightbulb, List, Mail, Menu, MessageSquare, MoreVertical, PieChart, Plus, Search, Sparkles, Users, Wallet, X } from "lucide-react";
import type { Chat } from "@/lib/chats";
import { createContext, createContextChat, getContext, getContexts, ContextsApiError, type ContextBundle, type ContextSourceType } from "@/lib/contexts";
import { archiveMemoryFact, getMemoryAttention, getMemoryDecision, getMemoryFact, getMemoryFactDependencies, getMemoryFactHistory, getMemoryFacts, MemoryApiError, resolveMemoryConflict, updateMemoryAttention, type MemoryAttention, type MemoryDecision, type MemoryFact } from "@/lib/memory";
import { getTrackedTopics, TrackedTopicsApiError, type TrackedTopic } from "@/lib/tracked-topics";
import { NotificationsButton } from "./NotificationsButton";
import { subscribeUserEvents } from "@/lib/user-events";
import { formatMemoryDate, memorySourceCountLabel, presentAttention, presentContext, presentMemoryFact, presentTrackedTopic, type MemorySource, type MemoryType, type MemoryViewModel } from "@/lib/memory-presentation";
import s from "./MemoryScreen.module.css";
import { useDialogFocus } from "./useDialogFocus";

const subscribeCompactMemory = (callback: () => void) => {
  const media = window.matchMedia("(max-width: 1000px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};

type Filter = "all" | "important" | "preference" | "people" | "event" | "obligation" | "finance" | "context" | "archive" | "telegram";
type Preset = "today" | "7" | "30" | "90" | "custom";
const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" }, { id: "important", label: "Важное" }, { id: "preference", label: "Предпочтения" },
  { id: "people", label: "Люди и проекты" }, { id: "event", label: "События" }, { id: "obligation", label: "Обязательства" },
  { id: "finance", label: "Финансы" }, { id: "context", label: "Контексты" }, { id: "archive", label: "Архив" },
  { id: "telegram", label: "Telegram" },
];
const icons: Record<MemoryType, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  preference: Clock3, person: Users, project: FolderOpen, event: CalendarDays, obligation: FileText,
  finance: PieChart, goal: Lightbulb, purchase: Wallet, document: FileText, context: Brain, other: Brain,
};
const sourceIcons: Record<MemorySource["kind"], ComponentType<{ size?: number }>> = {
  chat: MessageSquare, telegram: MessageSquare, mail: Mail, calendar: CalendarDays, document: FileText, finance: PieChart, manual: Brain,
};
const statusLabels = { active: "Активно", attention: "Требует внимания", archived: "В архиве", superseded: "Заменено", unknown: "На проверке" };
const sources: { id: ContextSourceType; label: string; icon: typeof FileText }[] = [
  { id: "chat", label: "Чаты", icon: MessageSquare },
  { id: "document", label: "Документы", icon: FileText },
  { id: "calendar", label: "Календарь", icon: CalendarDays },
  { id: "finance", label: "Финансы", icon: PieChart },
  { id: "email", label: "Почта", icon: Mail },
];
const pad = (value: number) => String(value).padStart(2, "0");
const localDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const displayDay = (value: string) => value ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "—";

export function TrackedTopicsScreen({ onMenu, onCreateChat, onOpenChat, onOpenSources, initialContextId, overlayOpen = false }: { onMenu: () => void; onCreateChat: () => Promise<Chat>; onOpenChat: (chat: Chat) => void; onOpenSources: () => void; initialContextId?: string; overlayOpen?: boolean }) {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [telegramFacts, setTelegramFacts] = useState<MemoryFact[]>([]);
  const [contexts, setContexts] = useState<ContextBundle[]>([]);
  const [topics, setTopics] = useState<TrackedTopic[]>([]);
  const [attention, setAttention] = useState<Array<{ attention: MemoryAttention; decision: MemoryDecision }>>([]);
  const [history, setHistory] = useState<MemoryFact[]>([]);
  const [dependencies, setDependencies] = useState<MemoryDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const compact = useSyncExternalStore(subscribeCompactMemory, () => window.matchMedia("(max-width: 1000px)").matches, () => false);
  const [builderMode, setBuilderMode] = useState<"auto" | "open" | "closed">("auto");
  const builderOpen = builderMode !== "closed" && (!compact || builderMode === "open");
  const setBuilderOpen = useCallback((open: boolean) => setBuilderMode(open ? "open" : "closed"), []);
  const [preset, setPreset] = useState<Preset>("custom");
  const [startDate, setStartDate] = useState(() => localDate(new Date(Date.now() - 29 * 86400000)));
  const [endDate, setEndDate] = useState(() => localDate(new Date()));
  const [selectedSources, setSelectedSources] = useState<ContextSourceType[]>(sources.map((source) => source.id));
  const [showAllImportant, setShowAllImportant] = useState(false);
  const [sortNewest, setSortNewest] = useState(true);
  const [showAllSources, setShowAllSources] = useState(false);

  useDialogFocus(compact && builderOpen, "[data-memory-builder]", () => setBuilderOpen(false), "[data-memory-build]", true);
  useDialogFocus(compact && detailOpen, "[data-memory-detail]", () => setDetailOpen(false), "[data-memory-build]", true);

  const handleError = useCallback((reason: unknown, fallback: string) => {
    if (reason instanceof DOMException && reason.name === "AbortError") return;
    if ((reason instanceof MemoryApiError || reason instanceof ContextsApiError || reason instanceof TrackedTopicsApiError) && reason.status === 401) {
      window.location.replace("/login?next=%2Fworkspace%3Fsection%3Dmemory");
      return;
    }
    setError(reason instanceof Error ? reason.message : fallback);
  }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const [nextFacts, nextTelegramFacts, nextContexts, nextTopics, nextAttention] = await Promise.all([
        getMemoryFacts(undefined, signal),
        getMemoryFacts(undefined, signal, 100, 0, "telegram_message").catch(() => [] as MemoryFact[]),
        getContexts(signal),
        getTrackedTopics(signal),
        getMemoryAttention("open", signal),
      ]);
      const decisions = await Promise.all(nextAttention.map((item) => getMemoryDecision(item.decision_id, signal)));
      setFacts(nextFacts); setTelegramFacts(nextTelegramFacts); setContexts(nextContexts); setTopics(nextTopics);
      setAttention(nextAttention.map((item, index) => ({ attention: item, decision: decisions[index] })));
      if (initialContextId && nextContexts.some((context) => context.id === initialContextId)) { setSelectedId(`context-${initialContextId}`); setDetailOpen(true); setBuilderOpen(false); }
    } catch (reason) { handleError(reason, "Не удалось загрузить память."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [handleError, initialContextId, setBuilderOpen]);
  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => void load(controller.signal)); return () => controller.abort(); }, [load]);
  useEffect(() => subscribeUserEvents((event) => {
    if (event.event === "telegram.memory.created") void load();
  }), [load]);

  const items = useMemo<MemoryViewModel[]>(() => [
    ...attention.map(({ attention: notice, decision }) => presentAttention(notice, decision)),
    ...[...new Map([...facts, ...telegramFacts].map((fact) => [fact.id, fact])).values()].map(presentMemoryFact), ...contexts.map(presentContext), ...topics.map(presentTrackedTopic),
  ], [attention, facts, telegramFacts, contexts, topics]);
  const important = items.filter((item) => item.important);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    return items.filter((item) => {
      const matches = filter === "all" || filter === "important" && item.important || filter === "preference" && item.type === "preference" ||
        filter === "people" && (item.type === "person" || item.type === "project") || filter === "event" && item.type === "event" ||
        filter === "obligation" && item.type === "obligation" || filter === "finance" && (item.type === "finance" || item.type === "goal" || item.type === "purchase") ||
        filter === "context" && item.type === "context" || filter === "archive" && (item.status === "archived" || item.status === "superseded") || filter === "telegram" && Boolean(item.fact && telegramFacts.some((fact) => fact.id === item.fact?.id));
      return matches && (!needle || [item.title, item.summary, item.typeLabel, item.overview].join(" ").toLocaleLowerCase("ru-RU").includes(needle));
    }).sort((a, b) => (new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()) * (sortNewest ? 1 : -1));
  }, [items, filter, query, sortNewest, telegramFacts]);
  const selected = items.find((item) => item.id === selectedId);
  const invalidRange = !startDate || !endDate || endDate < startDate;

  async function selectItem(item: MemoryViewModel) {
    setSelectedId(item.id); setDetailOpen(true); setBuilderOpen(false); setShowAllSources(false); setHistory([]); setDependencies([]);
    try {
      if (item.fact) {
        const [detail, nextHistory, nextDependencies] = await Promise.all([getMemoryFact(item.fact.id), getMemoryFactHistory(item.fact.id), getMemoryFactDependencies(item.fact.id)]);
        setFacts((current) => current.map((fact) => fact.id === detail.id ? detail : fact)); setHistory(nextHistory); setDependencies(nextDependencies);
      } else if (item.context) {
        const detail = await getContext(item.context.id);
        setContexts((current) => current.map((context) => context.id === detail.id ? detail : context));
      }
    } catch (reason) { handleError(reason, "Не удалось загрузить детали."); }
  }
  function choosePreset(value: Preset) {
    setPreset(value);
    if (value === "custom") return;
    const end = new Date(); const start = new Date(end);
    if (value !== "today") start.setDate(start.getDate() - Number(value) + 1);
    setStartDate(localDate(start)); setEndDate(localDate(end));
  }
  function toggleSource(value: ContextSourceType) {
    setSelectedSources((current) => current.includes(value) ? current.filter((source) => source !== value) : [...current, value]);
  }
  async function buildContext() {
    if (busy || invalidRange || selectedSources.length === 0) return;
    setBusy("create-context"); setError("");
    try {
      const from = new Date(`${startDate}T00:00:00`);
      const to = new Date(`${endDate}T00:00:00`); to.setDate(to.getDate() + 1);
      const created = await createContext({ title: `Контекст: ${displayDay(startDate)} — ${displayDay(endDate)}`, date_from: from.toISOString(), date_to: to.toISOString(), source_types: selectedSources });
      setContexts((current) => [created, ...current]);
      await selectItem(presentContext(created));
    } catch (reason) { handleError(reason, "Не удалось собрать контекст."); }
    finally { setBusy(""); }
  }
  async function archiveFact(item: MemoryViewModel) {
    if (!item.fact || busy || !window.confirm(`Архивировать «${item.title}»?`)) return;
    setBusy(item.fact.id);
    try { await archiveMemoryFact(item.fact.id); setDetailOpen(false); await load(); }
    catch (reason) { handleError(reason, "Не удалось архивировать воспоминание."); }
    finally { setBusy(""); }
  }
  async function resolveConflict(factId: string) {
    if (!selected?.fact || busy) return;
    setBusy(selected.fact.id);
    try { await resolveMemoryConflict(selected.fact.id, factId); await load(); }
    catch (reason) { handleError(reason, "Не удалось разрешить конфликт."); }
    finally { setBusy(""); }
  }
  async function closeAttention(status: "resolved" | "dismissed") {
    if (!selected?.attention || busy) return;
    setBusy(selected.attention.id);
    try { await updateMemoryAttention(selected.attention.id, status); setAttention((current) => current.filter((item) => item.attention.id !== selected.attention?.id)); setDetailOpen(false); }
    catch (reason) { handleError(reason, "Не удалось обновить уведомление."); }
    finally { setBusy(""); }
  }
  async function startChat() {
    if (busy) return;
    setBusy("chat");
    try {
      if (selected?.context) { const result = await createContextChat(selected.context.id, `Чат: ${selected.context.title}`); onOpenChat(result.chat); }
      else await onCreateChat();
    } catch (reason) { handleError(reason, "Не удалось создать чат."); setBusy(""); }
  }
  function renderRow(item: MemoryViewModel) {
    const Icon = icons[item.type];
    return <article className={`${s.row} ${selectedId === item.id && detailOpen ? s.selected : ""}`} key={item.id}>
      <button className={s.rowMain} type="button" onClick={() => void selectItem(item)} aria-label={`Открыть ${item.title}`}><span className={s.rowIcon}><Icon size={23} strokeWidth={1.7} /></span><span className={s.rowCopy}><strong>{item.title}</strong><small>{item.summary || item.overview}</small></span></button>
      <span className={`${s.badge} ${s[`badge_${item.type}`]}`}>{item.typeLabel}</span>
      <span className={s.sourceCell}><FileText size={18} /><span>{memorySourceCountLabel(item.sourceCount)}<small>{item.sourceLabel || "Нет источников"}</small></span></span>
      <span className={s.statusCell}><span className={s[`status_${item.status}`]}><i />{statusLabels[item.status]}</span><small>{formatMemoryDate(item.updatedAt)}</small></span>
      {item.fact && item.status !== "archived" && item.status !== "superseded" ? <button className={s.more} type="button" disabled={Boolean(busy)} aria-label={`Архивировать «${item.title}»`} onClick={() => void archiveFact(item)}><MoreVertical size={18} /></button> : <span />}
    </article>;
  }

  return <main className={`${s.screen} ${!builderOpen && !detailOpen ? s.panelClosed : ""}`}>
    <section className={s.main}>
      <header className={s.header}><button className={s.mobileMenu} type="button" aria-label="Открыть меню" onClick={onMenu}><Menu /></button><div><h1>Память</h1><p>То, что Assistant запомнил о вас, ваших делах и важных изменениях.</p></div><div className={s.headerActions}><NotificationsButton /><button className={s.secondaryCreate} data-memory-build type="button" onClick={() => { setDetailOpen(false); setBuilderOpen(true); }}><Brain size={17} />Собрать контекст</button><button className={s.create} type="button" disabled={Boolean(busy)} onClick={() => void onCreateChat()}><Plus size={17} />Создать чат</button></div></header>
      <div className={s.toolbar}><label className={s.search}><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по памяти (например: встречи, расходы, Aurora, отпуск)" aria-label="Поиск по памяти" /></label><div className={s.filters}>{filters.map((item) => <button type="button" key={item.id} aria-pressed={filter === item.id} className={filter === item.id ? s.filterActive : ""} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div></div>
      <div className={s.list}>
        {error && <p className={s.error} role="alert">{error}</p>}
        {loading && items.length === 0 && <p className={s.notice}>Загружаем память…</p>}
        <section className={s.important}>
          <div className={s.importantHeader}>
            <Sparkles size={31} />
            <div><h2>Assistant подметил</h2><p>То, что сейчас может потребовать вашего внимания.</p></div>
            {important.length > 3 && <button type="button" onClick={() => setShowAllImportant(!showAllImportant)}>{showAllImportant ? "Скрыть" : `Показать все (${important.length})`}</button>}
          </div>
          {important.length ? <div className={s.importantCards}>{important.slice(0, showAllImportant ? undefined : 3).map((item) => { const Icon = icons[item.type]; return <button type="button" key={item.id} onClick={() => void selectItem(item)}><span className={s.cardIcon}><Icon size={27} /></span><span><small>{item.typeLabel}</small><strong>{item.title}</strong><em>{item.summary}</em></span><ChevronRight size={18} /></button>; })}</div> : <div className={s.importantEmpty}><strong>Assistant пока не выделил ничего срочного</strong><span>Здесь появятся важные обязательства, изменения и цели.</span></div>}
        </section>
        <div className={s.collectionHeader}><h2>Все воспоминания</h2><button type="button" onClick={() => setSortNewest(!sortNewest)}>{sortNewest ? "Сначала новые" : "Сначала старые"}<ChevronRight size={15} className={s.sortChevron} /></button><List size={19} /></div>
        {!loading && visible.length === 0 && <p className={s.notice}>Воспоминания не найдены.</p>}
        <div className={s.rows}>{visible.map(renderRow)}</div>
      </div>
    </section>
    {builderOpen && <aside className={s.panel} data-memory-builder inert={compact && overlayOpen} aria-hidden={compact && overlayOpen ? true : undefined} data-mobile-open={builderMode === "open"} role={compact && !overlayOpen ? "dialog" : undefined} aria-modal={compact && !overlayOpen ? true : undefined} aria-labelledby="memory-builder-title">
      <header className={s.panelHeader}><div><h2 id="memory-builder-title">Собрать контекст</h2><p>Выберите период — Assistant соберёт связанную информацию из ваших источников.</p></div><button type="button" aria-label="Закрыть" onClick={() => setBuilderOpen(false)}><X size={19} /></button></header>
      <div className={s.panelBody}>
        <section className={s.builderSection}>
          <h3>Период</h3>
          <div className={s.presets}>{([["today", "Сегодня"], ["7", "7 дней"], ["30", "30 дней"], ["90", "90 дней"], ["custom", "Свой период"]] as const).map(([id, label]) => <button type="button" key={id} className={preset === id ? s.presetActive : ""} onClick={() => choosePreset(id)}>{label}</button>)}</div>
          <div className={s.dateFields}><label><span>С</span><input type="date" aria-label="Начало периода" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPreset("custom"); }} /></label><label><span>По</span><input type="date" aria-label="Конец периода" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPreset("custom"); }} /></label></div>
          {invalidRange && <p className={s.error} role="alert">Дата окончания должна быть не раньше даты начала.</p>}
        </section>
        <section className={s.builderSection}>
          <div className={s.sectionTitle}><h3>Что включить</h3><button type="button" onClick={() => setSelectedSources(sources.map((source) => source.id))}>Выбрать все</button></div>
          <div className={s.sourceOptions}>
            {sources.map((source) => { const Icon = source.icon; return <label key={source.id}><input type="checkbox" checked={selectedSources.includes(source.id)} onChange={() => toggleSource(source.id)} /><span className={s.checkMark}><Check size={13} /></span><span className={s.sourceIcon}><Icon size={19} /></span><span className={s.sourceCopy}><span>{source.label}</span></span></label>; })}
          </div>
        </section>
        <section className={s.builderPreview}>
          <div className={s.previewSection}><h3>Предварительно</h3><p>Период</p><strong>{displayDay(startDate)} — {displayDay(endDate)}</strong><p>Источники</p><strong>{selectedSources.length ? selectedSources.map((id) => sources.find((source) => source.id === id)?.label).join(" · ") : "Не выбраны"}</strong></div>
          <p className={s.hint}>Точное количество источников будет показано после сборки контекста.</p>
        </section>
      </div>
      <footer className={s.panelFooter}><button className={s.primaryAction} type="button" disabled={Boolean(busy) || invalidRange || selectedSources.length === 0} onClick={() => void buildContext()}><Sparkles size={19} />{busy === "create-context" ? "Собираем…" : "Собрать контекст"}</button><button type="button" onClick={() => setBuilderOpen(false)}>Отмена</button></footer>
    </aside>}
    {detailOpen && selected && <aside className={s.panel} data-memory-detail inert={compact && overlayOpen} aria-hidden={compact && overlayOpen ? true : undefined} role={compact && !overlayOpen ? "dialog" : undefined} aria-modal={compact && !overlayOpen ? true : undefined} aria-labelledby="memory-detail-title"><header className={s.panelHeader}><div><h2 id="memory-detail-title">{selected.title}</h2><p>{statusLabels[selected.status]} · {formatMemoryDate(selected.updatedAt)}</p></div><button type="button" aria-label="Закрыть" onClick={() => setDetailOpen(false)}><X size={19} /></button></header><div className={s.panelBody}><section><h3>О воспоминании</h3><p>{selected.overview}</p></section>{selected.details.length > 0 && <section><h3>Детали</h3><ul>{selected.details.map((detail) => <li key={detail}>{detail}</li>)}{dependencies.map((decision) => <li key={decision.id}>Связанное решение: {decision.decision_key.replace(/[._-]+/g, " ")}</li>)}</ul></section>}{selected.fact?.status === "conflicted" && history.length > 0 && <section><h3>Выберите актуальную версию</h3>{history.map((fact) => <button className={s.conflictChoice} type="button" disabled={Boolean(busy)} key={fact.id} onClick={() => void resolveConflict(fact.id)}>{presentMemoryFact(fact).overview}</button>)}</section>}<section><div className={s.sectionTitle}><h3>Источники</h3>{selected.sources.length > 4 && <button type="button" onClick={() => setShowAllSources(!showAllSources)}>{showAllSources ? "Скрыть" : `Показать все (${selected.sources.length})`}</button>}</div>{selected.sources.length ? selected.sources.slice(0, showAllSources ? undefined : 4).map((source) => { const Icon = sourceIcons[source.kind]; return <div className={s.detailSource} key={source.id}><Icon size={19} /><span>{source.label}<small>{source.description}</small></span></div>; }) : <p>Источники не найдены.</p>}</section></div><footer className={s.panelFooter}><button className={s.primaryAction} type="button" disabled={Boolean(busy)} onClick={() => void startChat()}><MessageSquare size={18} />{selected.context ? "Создать чат по контексту" : "Создать чат"}</button>{selected.attention && <><button type="button" disabled={Boolean(busy)} onClick={() => void closeAttention("resolved")}>Отметить решённым</button><button type="button" disabled={Boolean(busy)} onClick={() => void closeAttention("dismissed")}>Скрыть</button></>}<button type="button" data-memory-sources onClick={onOpenSources}><FolderOpen size={17} />Открыть источники</button><button type="button" onClick={() => { setDetailOpen(false); setBuilderOpen(true); }}><ChevronLeft size={17} />Собрать другой контекст</button></footer></aside>}
  </main>;
}
