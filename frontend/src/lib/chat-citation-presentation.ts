import type { ChatMessageCitation } from "./chats";

export type DisplayCitation = {
  id: string;
  group: string;
  title: string;
  value: string;
  source: string;
  sourceDate?: string;
  validity?: string;
  historical: boolean;
};

const knownKeys: Record<string, string> = {
  "meeting time": "Время встречи",
  "meeting schedule": "Расписание встречи",
  "reminder first check": "Первое напоминание",
  "reminder second check": "Повторное напоминание",
  "travel seat preference": "Предпочтение по месту",
  "travel preferred departure time": "Предпочитаемое время вылета",
  "user employer": "Место работы",
  "profile birth date": "Дата рождения",
  "financial goal target amount": "Целевая сумма накопления",
};

const words: Record<string, string> = {
  user: "пользователь", profile: "профиль", work: "работа", personal: "личное",
  meeting: "встреча", reminder: "напоминание", first: "первое", second: "повторное",
  time: "время", date: "дата", schedule: "расписание", deadline: "срок",
  travel: "поездка", seat: "место", preference: "предпочтение", preferred: "предпочитаемое",
  departure: "вылет", arrival: "прибытие", employer: "место работы",
  company: "компания", project: "проект", goal: "цель", financial: "финансовая",
  finance: "финансы", target: "целевая", amount: "сумма", budget: "бюджет",
  birth: "рождение", contract: "договор", renewal: "продление", notice: "уведомление",
  period: "период", allergy: "аллергия", supplier: "поставщик", task: "задача",
};

const groups: Record<string, string> = {
  meeting: "Встречи", reminder: "Напоминания", travel: "Поездки",
  finance: "Финансы", financial: "Финансы", goal: "Цели", user: "О вас",
  profile: "О вас", contract: "Договоры", task: "Задачи",
};

const sourceLabels: Record<string, string> = {
  chat_message: "Переписка", dataset_item: "Загруженные данные",
  email_message: "Почта", email: "Почта", telegram_message: "Telegram",
  calendar_event: "Календарь", document: "Документ", transaction: "Финансы",
  action_result: "Результат действия", manual: "Добавлено вручную", profile: "Память",
};

function capitalize(value: string) { return value.charAt(0).toLocaleUpperCase("ru-RU") + value.slice(1); }

export function safeTimeZone(timeZone?: string) {
  try { new Intl.DateTimeFormat("ru-RU", { timeZone: timeZone || "Europe/Moscow" }); return timeZone || "Europe/Moscow"; }
  catch { return "Europe/Moscow"; }
}

function dayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function formatCitationDate(value: string | null | undefined, timeZone: string, now = new Date(), relative = false) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const zone = safeTimeZone(timeZone);
  const hasTime = /T\d{2}:\d{2}/i.test(value);
  if (relative && hasTime) {
    const currentDay = dayKey(now, zone);
    const tomorrowDay = dayKey(new Date(now.getTime() + 86_400_000), zone);
    const targetDay = dayKey(date, zone);
    const clock = new Intl.DateTimeFormat("ru-RU", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(date);
    if (targetDay === currentDay) return `Сегодня, ${clock}`;
    if (targetDay === tomorrowDay) return `Завтра, ${clock}`;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: hasTime ? zone : "UTC", day: "numeric", month: "long",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    ...(date.getUTCFullYear() !== now.getUTCFullYear() ? { year: "numeric" } : {}),
  }).format(date);
}

export function formatCitationTitle(key: string | null | undefined) {
  if (!key) return "Сведения";
  const normalized = key.toLocaleLowerCase("ru-RU").replace(/[.:_\-]+/g, " ").replace(/\s+/g, " ").trim();
  if (knownKeys[normalized]) return knownKeys[normalized];
  const translated = normalized.split(" ").map((word) => words[word]).filter(Boolean);
  return translated.length ? capitalize(translated.join(" ")) : "Сведения";
}

function citationGroup(key: string | null, sourceType: string) {
  if (sourceType.toLowerCase() === "action_result") return "Результаты действий";
  const first = key?.toLowerCase().split(/[.:_\-]/)[0] ?? "";
  return groups[first] ?? "Другое";
}

function formatValue(raw: string | null, timeZone: string, now: Date) {
  if (!raw?.trim()) return "Значение не указано";
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
    return formatCitationDate(value, timeZone, now, true) ?? "Дата не указана";
  }
  return value.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})\b/g, (match) => formatCitationDate(match, timeZone, now) ?? "дата не указана");
}

export function presentChatCitations(citations: ChatMessageCitation[], timeZone: string, now = new Date()): DisplayCitation[] {
  const seen = new Set<string>();
  return citations.flatMap((item, index) => {
    const identity = item.evidence_id || item.fact_id || `${item.fact_key}:${item.fact_value}:${item.source_type}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    const historical = Boolean(item.valid_to && !Number.isNaN(new Date(item.valid_to).getTime()) && new Date(item.valid_to) < now);
    const from = formatCitationDate(item.valid_from, timeZone, now);
    const to = formatCitationDate(item.valid_to, timeZone, now);
    const validity = historical && to ? `Было актуально до ${to}` : from ? `Актуально с ${from}` : undefined;
    return [{
      id: identity || String(index),
      group: citationGroup(item.fact_key, item.source_type),
      title: item.source_type.toLowerCase() === "action_result" ? "Результат действия" : formatCitationTitle(item.fact_key),
      value: formatValue(item.fact_value, timeZone, now),
      source: sourceLabels[item.source_type.toLowerCase()] ?? "Источник",
      sourceDate: formatCitationDate(item.observed_at, timeZone, now, true),
      validity,
      historical,
    }];
  });
}
