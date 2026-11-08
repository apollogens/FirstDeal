export type Guard<T> = (value: unknown) => value is T;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const isString = (value: unknown): value is string => typeof value === "string";
export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
export const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const isDecimalString = (value: unknown): value is string => typeof value === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value));
export const isCurrencyCode = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z]{3}$/.test(value);
export const isIsoDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const isDateString = (value: unknown): value is string => {
  if (isIsoDate(value)) return true;
  if (typeof value !== "string") return false;
  const parts = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))?$/.exec(value);
  return parts !== null && isIsoDate(parts[1]) && Number(parts[2]) < 24 && Number(parts[3]) < 60 && Number(parts[4]) < 60 && (parts[5] === undefined || (Number(parts[5]) < 24 && Number(parts[6]) < 60)) && Number.isFinite(Date.parse(value));
};
export const isHttpUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; }
};
export const isUnknown = (value: unknown): value is unknown => { void value; return true; };
export const isNull = (value: unknown): value is null => value === null;

export function optional<T>(guard: Guard<T>): Guard<T | undefined> {
  return (value): value is T | undefined => value === undefined || guard(value);
}
export function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (value): value is T | null => value === null || guard(value);
}
export function arrayOf<T>(guard: Guard<T>): Guard<T[]> {
  return (value): value is T[] => Array.isArray(value) && value.every(guard);
}
export function oneOf<const T extends readonly string[]>(...values: T): Guard<T[number]> {
  return (value): value is T[number] => typeof value === "string" && values.some(item => item === value);
}
export function objectOf<T extends object>(fields: { [K in keyof T]-?: Guard<T[K]> }): Guard<T> {
  return (value): value is T => {
    if (!isRecord(value)) return false;
    for (const key in fields) if (!fields[key](value[key])) return false;
    return true;
  };
}

export function apiErrorMessage(value: unknown, fallback: string, prefer: "detail" | "message" = "detail"): string {
  if (!isRecord(value)) return fallback;
  if (prefer === "message" && typeof value.message === "string") return value.message;
  return typeof value.detail === "string" ? value.detail : typeof value.message === "string" ? value.message : fallback;
}
