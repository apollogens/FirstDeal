export type Source = {
  id: string;
  kind: "mail" | "calendar" | "document" | "memory" | "finance" | "file";
  title: string;
  description: string;
  targetId?: string;
  file?: File;
};
export const initialSources: Source[] = [];
export const availableSources: Source[] = [];
export const suggestions = {
  Финансы: [
    "Покажи расходы за этот месяц",
    "Помоги спланировать бюджет",
    "Найди регулярные платежи",
  ],
  Календарь: [
    "Что запланировано на завтра?",
    "Помоги найти время для встречи",
    "Покажи ближайшие задачи",
  ],
  Документы: [
    "Найди нужный документ",
    "Помоги сравнить документы",
    "Какие документы доступны в диалоге?",
  ],
  Память: [
    "Что ты помнишь о моих предпочтениях?",
    "Покажи сохранённые цели",
    "Помоги исправить сохранённый факт",
  ],
};
export type QuickTab = keyof typeof suggestions;
