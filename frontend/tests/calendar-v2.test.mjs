import assert from "node:assert/strict";
import test from "node:test";
import {
  clipEventsToVisibleRange,
  layoutOverlappingEvents,
  visibleCapacityForWidth,
} from "../src/features/calendar-v2/utils/layoutOverlappingEvents.ts";
import {
  CALENDAR_OVERLAY_STORAGE_KEY,
  readCalendarOverlay,
  setEventImportance,
  writeCalendarOverlay,
} from "../src/features/calendar-v2/adapters/calendarLocalOverlay.ts";

function event(id, start, end, important = false, createdAt = id) {
  return {
    id,
    title: id,
    start: new Date(`2026-09-22T${start}:00+03:00`),
    end: new Date(`2026-09-22T${end}:00+03:00`),
    important,
    createdAt,
    source: {},
  };
}

test("1-3 overlaps stay visible and use deterministic lanes", () => {
  for (const count of [1, 2, 3]) {
    const cluster = layoutOverlappingEvents(
      Array.from({ length: count }, (_, index) => event(String(index), "12:00", "13:00")),
    )[0];
    assert.equal(cluster.visible.length, count);
    assert.equal(cluster.hidden.length, 0);
    assert.equal(cluster.visible[0].lanes, count);
  }
});

test("4+ overlaps keep three cards and expose the exact overflow count", () => {
  const four = layoutOverlappingEvents(Array.from({ length: 4 }, (_, index) => event(String(index), "12:00", "13:00")))[0];
  const five = layoutOverlappingEvents(Array.from({ length: 5 }, (_, index) => event(String(index), "12:00", "13:00")))[0];
  assert.equal(four.visible.length, 3);
  assert.equal(four.hidden.length, 1);
  assert.equal(five.visible.length, 3);
  assert.equal(five.hidden.length, 2);
});

test("visible capacity respects the minimum readable card width", () => {
  assert.equal(visibleCapacityForWidth(70), 1);
  assert.equal(visibleCapacityForWidth(180), 2);
  assert.equal(visibleCapacityForWidth(300), 3);
});

test("events outside timeline hours are removed and boundary events are clipped", () => {
  const rangeStart = new Date("2026-09-22T09:00:00+03:00");
  const rangeEnd = new Date("2026-09-22T21:00:00+03:00");
  const clipped = clipEventsToVisibleRange([
    event("night", "00:33", "03:03"),
    event("boundary", "08:00", "10:00"),
    event("day", "10:00", "11:00"),
  ], rangeStart, rangeEnd);
  assert.deepEqual(clipped.map(({ id }) => id), ["boundary", "day"]);
  assert.equal(clipped[0].start.getTime(), rangeStart.getTime());
  assert.equal(clipped[0].end.getTime(), new Date("2026-09-22T10:00:00+03:00").getTime());
});

test("clipped boundary intervals participate in the same overflow calculation", () => {
  const rangeStart = new Date("2026-09-22T09:00:00+03:00");
  const rangeEnd = new Date("2026-09-22T21:00:00+03:00");
  const visible = clipEventsToVisibleRange([
    event("boundary", "08:00", "10:00"),
    event("morning-a", "09:00", "10:00"),
    event("morning-b", "09:00", "10:00"),
  ], rangeStart, rangeEnd);
  const cluster = layoutOverlappingEvents(visible, 2)[0];
  assert.equal(cluster.visible.length, 2);
  assert.equal(cluster.hidden.length, 1);
});

test("dense narrow clusters keep the long primary card and move excess events to overflow", () => {
  const cluster = layoutOverlappingEvents([
    event("primary", "10:00", "13:00"),
    event("short-a", "12:00", "13:00"),
    event("short-b", "12:00", "13:00"),
    event("short-c", "12:00", "13:00"),
  ], 2)[0];
  assert.equal(cluster.visible.length, 2);
  assert.ok(cluster.visible.some(({ event: item }) => item.id === "primary"));
  assert.equal(cluster.hidden.length, 2);
});

test("important events remain visible and partial intersections form one true cluster", () => {
  const cluster = layoutOverlappingEvents([
    event("a", "12:00", "13:00"),
    event("b", "12:30", "14:00"),
    event("c", "13:00", "14:00"),
    event("d", "12:50", "13:10"),
    event("important", "12:45", "13:15", true),
  ])[0];
  assert.equal(cluster.all.length, 5);
  assert.ok(cluster.visible.some(({ event: item }) => item.id === "important"));
  assert.equal(cluster.hidden.length, 1);
});

test("touching intervals do not overlap", () => {
  const clusters = layoutOverlappingEvents([
    event("a", "12:00", "13:00"),
    event("b", "13:00", "14:00"),
  ]);
  assert.equal(clusters.length, 2);
});

test("a chained group with at most three simultaneous events does not overflow", () => {
  const cluster = layoutOverlappingEvents([
    event("a", "12:00", "13:00"),
    event("b", "12:30", "13:30"),
    event("c", "13:00", "14:00"),
    event("d", "13:30", "14:30"),
  ])[0];
  assert.equal(cluster.visible.length, 4);
  assert.equal(cluster.hidden.length, 0);
  assert.equal(cluster.visible[0].lanes, 2);
});

test("importance overlay survives storage roundtrip and storage failures", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const overlay = setEventImportance({}, "event-1", true);
  writeCalendarOverlay(overlay, storage);
  assert.equal(values.has(CALENDAR_OVERLAY_STORAGE_KEY), true);
  assert.deepEqual(readCalendarOverlay(storage), overlay);
  assert.doesNotThrow(() => writeCalendarOverlay(overlay, { setItem() { throw new Error("blocked"); } }));
});
