import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { filterChats } from "../src/features/history-v2/utils/filterChats.ts";
import { groupChatsByDate } from "../src/features/history-v2/utils/groupChatsByDate.ts";
import { normalizeChat } from "../src/features/history-v2/utils/normalizeChat.ts";
import { sortChats } from "../src/features/history-v2/utils/sortChats.ts";
import { HISTORY_OVERLAY_KEY, LocalHistoryOverlay } from "../src/features/history-v2/api/localHistoryOverlay.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const values = new Map();
const browser = new EventTarget();
browser.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
globalThis.window = browser;

const backendChat = (id, title, updated = "2026-09-21T08:00:00.000Z") => ({ id, user_id: "user", title, created_at: "2026-09-20T08:00:00.000Z", updated_at: updated });

test("history overlay rejects malformed nested preferences without trusting JSON casts", () => {
  const overlay = new LocalHistoryOverlay();
  for (const value of [{ chat: null }, { chat: { titleOverride: 42 } }, { chat: { locallyDeleted: "true" } }, { chat: [] }]) {
    values.set(HISTORY_OVERLAY_KEY, JSON.stringify(value));
    assert.deepEqual(overlay.read(), {});
  }
  values.set(HISTORY_OVERLAY_KEY, JSON.stringify({ chat: { pinned: true, titleOverride: "Demo" } }));
  assert.deepEqual(overlay.read(), { chat: { pinned: true, titleOverride: "Demo" } });
  values.clear();
});

test("HistoryV2 is isolated from legacy screens", async () => {
  const source = await readFile(resolve(root, "src/features/history-v2/HistoryV2.tsx"), "utf8");
  assert.doesNotMatch(source, /HistoryScreen/);
  assert.doesNotMatch(source, /ChatScreen/);
  assert.doesNotMatch(source, /HistoryScreen\.module\.css/);
});

test("normalizes backend Chat without invented backend fields", () => {
  assert.deepEqual(normalizeChat(backendChat("a", "Backend")), {
    id: "a", title: "Backend", createdAt: "2026-09-20T08:00:00.000Z", updatedAt: "2026-09-21T08:00:00.000Z",
    pinned: false, important: false, archived: false, capability: { contextAvailable: false, backendPersistence: false },
  });
});

test("backend title wins legacy overlay while local metadata remains supported", () => {
  values.clear();
  const overlay = new LocalHistoryOverlay();
  overlay.update("a", { titleOverride: "Renamed", pinned: true, important: true, archived: true });
  let entry = overlay.read().a;
  let chat = normalizeChat(backendChat("a", "Backend"), entry);
  assert.equal(chat.title, "Backend");
  assert.equal(chat.pinned, true);
  assert.equal(chat.important, true);
  assert.equal(chat.archived, true);
  overlay.update("a", { pinned: false, archived: false, locallyDeleted: true });
  entry = overlay.read().a;
  chat = normalizeChat(backendChat("a", "Backend"), entry);
  assert.equal(chat.pinned, false);
  assert.equal(chat.archived, false);
  assert.equal(entry.locallyDeleted, true);
});

test("reload restores the namespaced overlay", () => {
  values.set(HISTORY_OVERLAY_KEY, JSON.stringify({ a: { pinned: true } }));
  assert.equal(new LocalHistoryOverlay().read().a.pinned, true);
});

test("search and filters use available view-model data", () => {
  const chats = [normalizeChat(backendChat("a", "Маршрут"), { pinned: true }), normalizeChat(backendChat("b", "Бюджет"), { important: true, archived: true })];
  assert.deepEqual(filterChats(chats, "pinned", "марш" ).map((chat) => chat.id), ["a"]);
  assert.deepEqual(filterChats(chats, "important", ""), []);
  assert.deepEqual(filterChats(chats, "archived", "").map((chat) => chat.id), ["b"]);
  assert.deepEqual(filterChats(chats, "context", ""), []);
});

test("sorting and date grouping are deterministic", () => {
  const chats = [normalizeChat(backendChat("b", "Я", "2026-09-20T10:00:00.000Z")), normalizeChat(backendChat("a", "А", "2026-09-21T10:00:00.000Z"))];
  assert.deepEqual(sortChats(chats, "updated-desc").map((chat) => chat.id), ["a", "b"]);
  assert.deepEqual(sortChats(chats, "title").map((chat) => chat.id), ["a", "b"]);
  assert.deepEqual(groupChatsByDate(chats, new Date("2026-09-21T12:00:00.000Z")).map((group) => group.key), ["today", "yesterday"]);
});

test("Sidebar consumes repository-backed pinned chats", async () => {
  const source = await readFile(resolve(root, "src/components/Sidebar.tsx"), "utf8");
  assert.match(source, /useHistoryChats/);
  assert.match(source, /chat\.pinned && !chat\.archived/);
  assert.doesNotMatch(source, /getChats/);
});

test("URL selection guards rapid A to B and destructive selection is cleared", async () => {
  const selection = await readFile(resolve(root, "src/features/history-v2/hooks/useHistorySelection.ts"), "utf8");
  const screen = await readFile(resolve(root, "src/features/history-v2/HistoryV2.tsx"), "utf8");
  assert.match(selection, /historyChat/);
  assert.match(selection, /sequence\.current === current/);
  assert.match(screen, /selection\.select\(null\)/);
});
