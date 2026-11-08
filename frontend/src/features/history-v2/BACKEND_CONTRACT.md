# HistoryV2 backend contract

HistoryV2 currently reads real chats through the existing `GET /chats` and `GET /chats/:id` contracts. Missing mutations are isolated in `LocalHistoryOverlay` and marked with `TODO(history-backend):`.

## Required chat fields

- `summary: string | null`
- `is_pinned: boolean` and optionally `pinned_at: datetime | null`
- `is_important: boolean`
- `archived_at: datetime | null`
- a chat-level context relation with stable source IDs

## Required mutations

`PATCH /chats/:id` should accept independently:

```json
{
  "title": "string",
  "is_pinned": true,
  "is_important": true,
  "archived_at": "datetime-or-null"
}
```

The response should contain the updated chat and enforce ownership. Repeating pin/archive values should be idempotent.

`DELETE /chats/:id` should enforce ownership and define whether deletion is soft or permanent.

## Context and activity

Chat detail should expose real context sources with stable IDs, names, kinds, sizes and open targets. A future activity endpoint or embedded collection should expose real timestamped events. Until these contracts exist, HistoryV2 intentionally renders no fabricated sources, entities, summaries, attachment counts or activity.

## List evolution

The list contract should eventually support `q`, `pinned`, `important`, `has_context`, `archived`, `sort`, and cursor pagination. Client-side filtering remains the temporary implementation for the current bounded list.
