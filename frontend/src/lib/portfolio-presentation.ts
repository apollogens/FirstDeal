// Pure presentation helpers; API contracts and source values remain unchanged.
export function expenseChartBackground(total: number, amounts: number[]) {
  if (!Number.isFinite(total) || total <= 0) return undefined;
  const colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];
  let cursor = 0;
  const stops: string[] = [];
  for (const [index, amount] of amounts.entries()) {
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const end = Math.min(100, cursor + amount / total * 100);
    if (end > cursor) stops.push(`${colors[index % colors.length]} ${cursor}% ${end}%`);
    cursor = end;
  }
  if (!stops.length) return undefined;
  if (cursor < 100) stops.push(`var(--border-subtle) ${cursor}% 100%`);
  return `conic-gradient(${stops.join(', ')})`;
}

type CalendarSlot = { starts_at: string; ends_at: string; duration_minutes: number };
export function validCalendarSlots(value: unknown, from: Date, to: Date): CalendarSlot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((slot: unknown): CalendarSlot[] => {
    if (typeof slot !== 'object' || slot === null || !('starts_at' in slot) || !('ends_at' in slot)
        || typeof slot.starts_at !== 'string' || typeof slot.ends_at !== 'string') return [];
    const start = Date.parse(slot.starts_at);
    const end = Date.parse(slot.ends_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < +from || end > +to) return [];
    return [{ starts_at: slot.starts_at, ends_at: slot.ends_at, duration_minutes: Math.round((end - start) / 60000) }];
  });
}
