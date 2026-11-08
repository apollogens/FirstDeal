const STOP_WORDS = new Set([
  "пожалуйста", "помоги", "посмотри", "покажи", "расскажи", "можешь", "нужно",
  "хочу", "мне", "мой", "мои", "мою", "про", "это", "этот", "эта", "для", "как",
]);

export function generateChatTitle(message: string) {
  const clean = message.replace(/[\n\r]+/g, " ").replace(/[!?.,:;()«»"']/g, " ").replace(/\s+/g, " ").trim();
  if (/письм\w*\s+мари/i.test(clean) || /встреч\w*\s+.*мари/i.test(clean)) return "Встреча с Марией";
  if (/расход/i.test(clean) && /сентябр/i.test(clean)) return "Расходы за сентябрь";
  if (/расход/i.test(clean)) return "Анализ расходов";
  if (/документ/i.test(clean)) return "Работа с документами";
  if (/календар|расписан|встреч/i.test(clean)) return "Планирование встречи";
  const words = clean.split(" ").filter((word) => word.length > 1 && !STOP_WORDS.has(word.toLocaleLowerCase("ru-RU"))).slice(0, 6);
  const title = words.join(" ").slice(0, 72).trim();
  return title ? title.charAt(0).toLocaleUpperCase("ru-RU") + title.slice(1) : "Новый чат";
}

type ChatTitleSource = "default" | "generated" | "manual";
export type ChatTitleOverride = { title: string; source: ChatTitleSource };
