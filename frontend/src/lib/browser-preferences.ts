// Stored preferences may be stale, edited manually, or unavailable in privacy mode.
export function readStoredStringList(storage: Pick<Storage, "getItem">, key: string): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
    return Array.isArray(value) && value.every((item: unknown) => typeof item === "string") ? value : [];
  } catch {
    return [];
  }
}
