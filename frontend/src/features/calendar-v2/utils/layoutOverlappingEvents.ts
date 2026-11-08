import type { CalendarEventViewModel } from "../types";

export type CalendarEventLayout = {
  event: CalendarEventViewModel;
  lane: number;
  lanes: number;
  clusterId: string;
};

export type CalendarEventCluster = {
  id: string;
  start: Date;
  end: Date;
  visible: CalendarEventLayout[];
  hidden: CalendarEventViewModel[];
  all: CalendarEventViewModel[];
};

const stableOrder = (left: CalendarEventViewModel, right: CalendarEventViewModel) =>
  Number(right.important) - Number(left.important) ||
  (right.end.getTime() - right.start.getTime()) - (left.end.getTime() - left.start.getTime()) ||
  (left.createdAt ?? "").localeCompare(right.createdAt ?? "") ||
  left.id.localeCompare(right.id);

export const MIN_READABLE_EVENT_WIDTH = 78;
export const MAX_VISIBLE_EVENT_LANES = 3;

export function visibleCapacityForWidth(width: number) {
  if (!Number.isFinite(width) || width <= 0) return 1;
  return Math.max(1, Math.min(MAX_VISIBLE_EVENT_LANES, Math.floor(width / MIN_READABLE_EVENT_WIDTH)));
}

export function clipEventsToVisibleRange(
  events: CalendarEventViewModel[],
  rangeStart: Date,
  rangeEnd: Date,
) {
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  return events.flatMap((event) => {
    const clippedStart = Math.max(event.start.getTime(), startMs);
    const clippedEnd = Math.min(event.end.getTime(), endMs);
    if (clippedEnd <= clippedStart) return [];
    return [{ ...event, start: new Date(clippedStart), end: new Date(clippedEnd) }];
  });
}

function fitsCapacity(events: CalendarEventViewModel[], capacity: number) {
  return events.every((point) => {
    const time = point.start.getTime();
    return events.filter((event) => event.start.getTime() <= time && event.end.getTime() > time).length <= capacity;
  });
}

export function layoutOverlappingEvents(events: CalendarEventViewModel[], visibleLimit = 3): CalendarEventCluster[] {
  const ordered = [...events].sort((left, right) =>
    left.start.getTime() - right.start.getTime() || left.end.getTime() - right.end.getTime() || stableOrder(left, right),
  );
  const groups: CalendarEventViewModel[][] = [];
  let group: CalendarEventViewModel[] = [];
  let groupEnd = -Infinity;

  for (const event of ordered) {
    if (group.length && event.start.getTime() >= groupEnd) {
      groups.push(group);
      group = [];
      groupEnd = -Infinity;
    }
    group.push(event);
    groupEnd = Math.max(groupEnd, event.end.getTime());
  }
  if (group.length) groups.push(group);

  return groups.map((items) => {
    // Keep important and long primary events first, then use stable creation/id order.
    // An event is rendered only when every simultaneous segment stays within capacity.
    const prioritized = [...items].sort(stableOrder);
    const visibleEvents: CalendarEventViewModel[] = [];
    const hidden: CalendarEventViewModel[] = [];
    for (const event of prioritized) {
      if (fitsCapacity([...visibleEvents, event], visibleLimit)) visibleEvents.push(event);
      else hidden.push(event);
    }
    const chronological = [...visibleEvents].sort((a, b) => a.start.getTime() - b.start.getTime() || stableOrder(a, b));
    const laneEnds: number[] = [];
    const lanesById = new Map<string, number>();
    for (const event of chronological) {
      let lane = laneEnds.findIndex((end) => end <= event.start.getTime());
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = event.end.getTime();
      lanesById.set(event.id, lane);
    }
    const lanes = Math.max(1, laneEnds.length);
    const start = new Date(Math.min(...items.map((event) => event.start.getTime())));
    const end = new Date(Math.max(...items.map((event) => event.end.getTime())));
    const id = `${start.getTime()}-${end.getTime()}-${items.map(({ id: eventId }) => eventId).sort().join("-")}`;
    return {
      id,
      start,
      end,
      all: prioritized,
      hidden,
      visible: chronological.map((event) => ({
        event,
        lane: lanesById.get(event.id) ?? 0,
        lanes,
        clusterId: id,
      })),
    };
  });
}
