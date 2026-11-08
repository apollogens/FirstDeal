import type { ContextBundle } from "@/lib/contexts";
import type { MemoryAttention, MemoryDecision, MemoryFact } from "@/lib/memory";
import type { TrackedTopic } from "@/lib/tracked-topics";

export type MemoryType = "preference" | "person" | "project" | "event" | "obligation" | "finance" | "goal" | "purchase" | "document" | "context" | "other";
export type MemorySource = { id: string; kind: "chat" | "telegram" | "mail" | "calendar" | "document" | "finance" | "manual"; label: string; description?: string; targetId?: string };
export type MemoryViewModel = {
  id: string; kind: "fact" | "context" | "attention" | "topic";
  title: string; summary?: string; type: MemoryType; typeLabel: string;
  status: "active" | "archived" | "superseded" | "attention" | "unknown";
  sourceCount: number; sourceLabel?: string; sources: MemorySource[];
  updatedAt?: string; important: boolean; overview: string; details: string[];
  fact?: MemoryFact; context?: ContextBundle; attention?: MemoryAttention;
};

const sourceLabels = { chat_message: "Чат", telegram_message: "Telegram", document: "Документ", calendar_event: "Календарь", transaction: "Финансы", manual: "Вручную", dataset_item: "Импорт", email: "Почта" } as const;
const sourceKinds = { chat_message: "chat", telegram_message: "telegram", document: "document", calendar_event: "calendar", transaction: "finance", manual: "manual", dataset_item: "manual", email: "mail" } as const;
const labels: Record<string, string> = {
  user: "О вас", work: "Работа", personal: "Личное", project: "Проект",
  office: "офиса", coffee_machine: "Кофемашина", office_coffee_machine: "Кофемашина для офиса",
  meeting_time: "Время встреч", contract_end_date: "Срок договора", notice_period: "Срок уведомления",
  advance_notice_period: "Срок уведомления", role: "Должность", position: "Должность",
  city: "Город", budget: "Бюджет", theme: "Тема",
  expense: "Расход", goal: "Цель", contract: "Договор", meeting: "Встреча",
  purpose: "Цель", amount: "Сумма", date: "Дата", time: "Время",
  first_check: "Первая проверка", second_check: "Повторная проверка",
};
function humanize(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Сведения";
  const key = trimmed.toLocaleLowerCase("ru-RU").replace(/[.\s-]+/g, "_");
  if (labels[key]) return labels[key];
  const words = trimmed.replace(/[._-]+/g, " ").replace(/\s+/g, " ");
  return words.charAt(0).toLocaleUpperCase("ru-RU") + words.slice(1);
}
function valueText(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "number") return new Intl.NumberFormat("ru-RU").format(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
      const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
      if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", ...(value.length > 10 ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}) }).format(date);
    }
    const readable = value.replace(/office\.coffee_machine/gi, "кофемашина для офиса");
    if (/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/i.test(readable) && /[._]/.test(readable)) return humanize(readable);
    return readable.replace(/\b\d{4,}\b/g, (number) => new Intl.NumberFormat("ru-RU").format(Number(number)));
  }
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.entries(value).map(([key, entry]) => `${humanize(key)}: ${valueText(entry)}`).join(" · ");
  return "";
}
export function formatMemoryDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const day = (item: Date) => new Date(item.getFullYear(), item.getMonth(), item.getDate()).getTime();
  const difference = Math.round((day(today) - day(date)) / 86400000);
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (difference === 0) return `Сегодня, ${time}`;
  if (difference === 1) return `Вчера, ${time}`;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" as const } : {}), hour: "2-digit", minute: "2-digit" }).format(date);
}
export function memorySourceCountLabel(count: number): string {
  const ending = count % 100 >= 11 && count % 100 <= 14 ? "источников" : count % 10 === 1 ? "источник" : count % 10 >= 2 && count % 10 <= 4 ? "источника" : "источников";
  return `${count} ${ending}`;
}
function classify(fact: MemoryFact): { type: MemoryType; label: string; title: string } {
  const key = `${fact.fact_type} ${fact.subject_type} ${fact.predicate}`.toLocaleLowerCase("ru-RU");
  if (/expense|purchase|coffee_machine|покупк/.test(key)) return { type: "purchase", label: "Финансы", title: "Покупка" };
  if (/goal|цель/.test(key)) return { type: "goal", label: "Финансовая цель", title: "Цель" };
  if (/money|finance|amount|сумм/.test(key)) return { type: "finance", label: "Финансы", title: "Финансовая информация" };
  if (/preference|meeting|предпочт/.test(key)) return { type: "preference", label: "Предпочтение", title: "Предпочтение" };
  if (/deadline|obligation|срок|обязательств/.test(key)) return { type: "obligation", label: "Обязательство", title: "Обязательство" };
  if (/event|reminder|событи/.test(key)) return { type: "event", label: "Событие", title: "Событие" };
  if (/project|проект/.test(key)) return { type: "project", label: "Проект", title: "Проект" };
  if (/person|contact|человек/.test(key)) return { type: "person", label: "Человек", title: "Человек" };
  if (/document|документ/.test(key)) return { type: "document", label: "Документ", title: "Документ" };
  return { type: "other", label: "Память", title: "Сохранённое сведение" };
}
export function presentMemoryFact(fact: MemoryFact): MemoryViewModel {
  const category = classify(fact);
  const subject = humanize(fact.subject);
  const predicate = humanize(fact.predicate);
  const value = valueText(fact.value);
  const officeCoffee = category.type === "purchase" && /office[._-]coffee_machine/.test(fact.predicate);
  const title = officeCoffee ? "Покупка для офиса" : category.type === "other" && subject !== "О вас" ? subject : category.type === "goal" && fact.predicate === "purpose" && value ? `Цель — ${value}` : category.type === "project" && subject !== "О вас" ? subject : category.title;
  const summary = [officeCoffee ? "Кофемашина" : subject === "О вас" ? "" : subject, fact.predicate === "purpose" || officeCoffee ? "" : predicate, value].filter(Boolean).join(" — ");
  const sources: MemorySource[] = fact.evidence.map((evidence) => {
    const location = evidence.evidence_location;
    const telegram = evidence.source_type === "telegram_message";
    const chat = typeof location.chat_title === "string" ? location.chat_title : "Telegram";
    const sender = typeof location.sender_name === "string" ? location.sender_name : typeof location.telegram_sender_id === "number" ? `Участник ${location.telegram_sender_id}` : "";
    const timestamp = typeof location.timestamp === "string" ? formatMemoryDate(location.timestamp) : formatMemoryDate(evidence.observed_at);
    return {
      id: evidence.id,
      kind: sourceKinds[evidence.source_type] ?? "manual",
      label: sourceLabels[evidence.source_type] ?? "Источник",
      description: telegram
        ? [chat, sender, timestamp, evidence.evidence_text].filter(Boolean).join(" · ")
        : evidence.evidence_text || undefined,
      targetId: evidence.source_id,
    };
  });
  return {
    id: `fact-${fact.id}`, kind: "fact", title, summary: summary || undefined, type: category.type, typeLabel: category.label,
    status: fact.status === "retracted" ? "archived" : fact.status === "superseded" ? "superseded" : fact.status === "conflicted" ? "attention" : fact.status === "active" ? "active" : "unknown",
    sourceCount: sources.length, sourceLabel: [...new Set(sources.map((source) => source.label))].join(" · "), sources,
    updatedAt: fact.last_observed_at, important: fact.status === "conflicted", overview: summary || title,
    details: [fact.valid_from ? `Действует с ${formatMemoryDate(fact.valid_from)}` : "", fact.valid_to ? `Действует до ${formatMemoryDate(fact.valid_to)}` : ""].filter(Boolean), fact,
  };
}
export function presentContext(context: ContextBundle): MemoryViewModel {
  const sources: MemorySource[] = context.items.map((item) => ({ id: `${item.source_type}-${item.source_id}`, kind: sourceKinds[item.source_type], label: sourceLabels[item.source_type], targetId: item.source_id }));
  const day = (value: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(value);
  const period = `${day(new Date(context.date_from))} — ${day(new Date(new Date(context.date_to).getTime() - 1))}`;
  return { id: `context-${context.id}`, kind: "context", title: context.title || "Контекст", summary: period, type: "context", typeLabel: "Контекст", status: "active", sourceCount: sources.length, sourceLabel: [...new Set(sources.map((source) => source.label))].join(" · "), sources, updatedAt: context.updated_at, important: false, overview: `Контекст за период: ${period}`, details: [], context };
}
export function presentTrackedTopic(topic: TrackedTopic): MemoryViewModel {
  return { id: `topic-${topic.id}`, kind: "topic", title: humanize(topic.query), summary: "Тема, которую Assistant учитывает при поиске новостей", type: "preference", typeLabel: "Предпочтение", status: "active", sourceCount: 0, sources: [], updatedAt: topic.updated_at, important: false, overview: humanize(topic.query), details: [`Проверка каждые ${topic.check_interval_minutes} мин.`] };
}
export function presentAttention(attention: MemoryAttention, decision: MemoryDecision): MemoryViewModel {
  return { id: `attention-${attention.id}`, kind: "attention", title: humanize(decision.decision_key), summary: attention.reason, type: "obligation", typeLabel: "Важно", status: "attention", sourceCount: 0, sources: [], updatedAt: attention.created_at, important: true, overview: attention.reason, details: Object.entries(decision.payload).map(([key, value]) => `${humanize(key)}: ${valueText(value)}`), attention };
}
