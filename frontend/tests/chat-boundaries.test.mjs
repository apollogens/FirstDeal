import assert from 'node:assert/strict';
import test from 'node:test';
import { connectChatSocket, connectUserSocket, parseChatSocketEvent } from '../src/lib/chats.ts';
import { readStoredStringList } from '../src/lib/browser-preferences.ts';

test('socket events accept declared event variants and typed optional data', () => {
  const value = { event: 'action_done', data: { action_id: 'a', chat_id: 'c', status: 'executed' } };
  assert.deepEqual(parseChatSocketEvent(JSON.stringify(value)), value);
  assert.deepEqual(parseChatSocketEvent('{"event":"pong"}'), { event: 'pong' });
  assert.deepEqual(parseChatSocketEvent('{"event":"error","error":"Unavailable"}'), { event: 'error', error: 'Unavailable' });
  // Producers: src/services/chat_actions.py, telegram/handlers.py, api/websocket.py.
  for (const value of [
    { event: 'action_undone', data: { action_id: 'a' } },
    { event: 'turn_accepted', data: { turn_id: 't' } },
    { event: 'action_confirmed', data: { action_id: 'a', status: 'confirmed' } },
    { event: 'proposal.updated', data: { action_id: 'a', status: 'confirmed' } },
  ]) assert.deepEqual(parseChatSocketEvent(JSON.stringify(value)), value);
});

test('socket events reject malformed frames and inconsistent field types', () => {
  for (const value of [null, '{}', 'null', '[]', '{invalid', '{"event":"unknown"}', '{"event":"toString"}', '{"event":"pong","data":null}', '{"event":"pong","data":[]}', '{"event":"notification","data":{"chat_id":1}}', '{"event":"turn_started","data":{"status":"invented"}}', '{"event":"error","error":{}}']) {
    assert.equal(parseChatSocketEvent(value), null);
  }
});

test('both socket connections reject malformed credentials before opening a socket', async t => {
  for (const value of [null, {}, { baseUrl: 'ws://localhost' }, { baseUrl: [], token: 'token' }]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(value));
    await assert.rejects(connectChatSocket('chat', () => {}), { status: 502 });
    await assert.rejects(connectUserSocket(() => {}), { status: 502 });
  }
});

test('storage preferences accept string lists and discard malformed data', () => {
  assert.deepEqual(readStoredStringList({ getItem: () => '["chat-a","chat-b"]' }, 'key'), ['chat-a', 'chat-b']);
  for (const value of [null, 'null', '{}', '"text"', '[1]', '["a",null]', '{invalid']) {
    assert.deepEqual(readStoredStringList({ getItem: () => value }, 'key'), []);
  }
  assert.deepEqual(readStoredStringList({ getItem: () => { throw new Error('Storage unavailable'); } }, 'key'), []);
});
