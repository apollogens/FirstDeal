import test from 'node:test';
import assert from 'node:assert/strict';
import * as chats from '../src/lib/chats.ts';

const stamp = '2026-11-06T09:00:00Z';
const chat = { id: 'c', user_id: 'u', title: 'Chat', created_at: stamp, updated_at: stamp };
const message = { id: 'm', chat_id: 'c', turn_id: null, sequence: 1, role: 'assistant', content: 'Hello', model: null, prompt_tokens: null, completion_tokens: null, created_at: stamp };
const turn = { id: 't', chat_id: 'c', client_request_id: 'r', status: 'pending', error_code: null, created_at: stamp, updated_at: stamp, completed_at: null };
const calendar = { title: 'Meeting', scope: 'work', description: '', starts_at: stamp, ends_at: null, location: null, remind_at: null };
const transaction = { category_id: 'category', scope: 'personal', amount: '12.50', currency: 'RUB', type: 'expense', date: '2026-11-06', description: '' };
const category = { name: 'Food', type: 'expense' };
const topic = { query: 'TypeScript', scope: 'work' };
const email = { to: ['a@example.com'], subject: 'Subject', body: 'Body', account_id: null, in_reply_to_id: null };
const actions = [
  ['create_calendar_event', calendar],
  ['update_calendar_event', { event_id: 'e', expected_updated_at: stamp, replacement: calendar, snapshot: null }],
  ['delete_calendar_event', { event_id: 'e', expected_updated_at: stamp, snapshot: calendar }],
  ['create_transaction', transaction],
  ['update_transaction', { transaction_id: 't', expected_updated_at: stamp, replacement: transaction, snapshot: transaction }],
  ['delete_transaction', { transaction_id: 't', expected_updated_at: stamp, snapshot: transaction }],
  ['create_finance_category', category],
  ['update_finance_category', { category_id: 'category', expected_updated_at: stamp, changes: { name: 'New', type: null }, snapshot: category }],
  ['delete_finance_category', { category_id: 'category', expected_updated_at: stamp, snapshot: category }],
  ['create_tracked_topic', topic],
  ['delete_tracked_topic', { topic_id: 'topic', expected_updated_at: stamp, snapshot: topic }],
  ['send_email', email],
].map(([kind, payload]) => ({ id: `a-${kind}`, chat_id: 'c', turn_id: 't', kind, status: 'pending', payload, result_id: null, expires_at: stamp, resolved_at: null, created_at: stamp }));

async function responds(body, action, status = 200) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => { calls.push(args); return new Response(JSON.stringify(body), { status }); };
  try { return await action(calls); } finally { globalThis.fetch = original; }
}

test('chat read helpers validate identity, optional nullable context and all public mutations', async () => {
  const originalWindow = globalThis.window;
  globalThis.window = { setTimeout: callback => { callback(); return 0; } };
  try {
    await responds([chat], async calls => {
      assert.deepEqual(await chats.getChats(), [chat]);
      assert.equal(calls[0][0], '/api/chats?limit=100&offset=0');
    });
    await responds(chat, async () => assert.deepEqual(await chats.updateChat('c', 'New'), chat));
    for (const helper of [() => chats.createChat(), () => chats.getChat('c')])
      await responds({ ...chat, context_id: null }, async () => assert.deepEqual(await helper(), { ...chat, context_id: null }));
    await responds([{ ...chat, title: [] }], async () => assert.rejects(chats.getChats(), chats.ChatsApiError));
  } finally { globalThis.window = originalWindow; }
  for (const patch of [{ user_id: undefined }, { context_id: 3 }, { created_at: 'invalid' }])
    await responds({ ...chat, ...patch }, async () => assert.rejects(chats.getChat('c'), chats.ChatsApiError));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(chats.getChats(controller.signal), { name: 'AbortError' });
});

test('message pages validate nested attachments, citations and legacy optional fields', async () => {
  const citation = { fact_id: null, evidence_id: null, source_type: 'document', source_id: null, fact_key: null, fact_value: null, confidence: null, valid_from: null, valid_to: null, observed_at: null };
  const attachment = { document_id: 'd', filename: 'x.pdf', scope: 'work', status: 'ready', pages_count: null, chunks_count: 0 };
  const page = { items: [{ ...message, attachments: [attachment], citations: [citation], is_supported: true }], next_before_sequence: 1 };
  await responds(page, async calls => {
    assert.deepEqual(await chats.getChatMessages('c/a', undefined, 2, 25), page);
    assert.equal(calls[0][0], '/api/chats/c%2Fa/messages?limit=25&before_sequence=2');
  });
  await responds({ items: [message], next_before_sequence: null }, async () => assert.equal((await chats.getChatMessages('c')).items.length, 1));
  for (const item of [{ ...message, attachments: [{ ...attachment, status: 'bogus' }] }, { ...message, citations: [{ ...citation, confidence: 'high' }] }, { ...message, is_supported: 'yes' }, { ...message, sequence: 1.5 }])
    await responds({ items: [item], next_before_sequence: null }, async () => assert.rejects(chats.getChatMessages('c'), chats.ChatsApiError));
  await responds({ items: [message], next_before_sequence: '1' }, async () => assert.rejects(chats.getChatMessages('c'), chats.ChatsApiError));
});

test('turn helpers validate both accepted entities and turn lifecycle DTOs', async () => {
  const accepted = { turn, message };
  await responds(accepted, async calls => {
    assert.deepEqual(await chats.sendChatMessage('c', 'Hello', 'r', ['d']), accepted);
    assert.deepEqual(JSON.parse(calls[0][1].body), { client_request_id: 'r', content: 'Hello', document_ids: ['d'] });
  });
  for (const helper of [() => chats.getChatTurn('c', 't'), () => chats.cancelChatTurn('c', 't')]) {
    await responds(turn, async () => assert.deepEqual(await helper(), turn));
    await responds({ ...turn, status: 'unknown' }, async () => assert.rejects(helper, chats.ChatsApiError));
  }
  await responds({ turn, message: { ...message, role: 'unknown' } }, async () => assert.rejects(chats.sendChatMessage('c', 'Hi'), chats.ChatsApiError));
});

test('action guards distinguish every kind and validate nested payloads', () => {
  for (const action of actions) {
    assert.equal(chats.isChatAction(action), true, action.kind);
    assert.equal(chats.isChatAction({ ...action, payload: {} }), false, action.kind);
    assert.equal(chats.isChatAction({ ...action, payload: 'wrong' }), false, action.kind);
  }
  assert.equal(chats.isChatAction({ ...actions[0], payload: transaction }), false);
  assert.equal(chats.isChatAction({ ...actions[1], payload: { transaction_id: 'wrong', expected_updated_at: stamp, replacement: calendar } }), false);
  assert.equal(chats.isChatAction({ ...actions[1], payload: { ...actions[1].payload, snapshot: transaction } }), false);
  assert.equal(chats.isChatAction({ ...actions[7], payload: { ...actions[7].payload, changes: { name: null, type: null } } }), false);
  assert.equal(chats.isChatAction({ ...actions[11], payload: { ...email, to: [4] } }), false);
  assert.equal(chats.isChatAction({ ...actions[11], payload: { ...email, to: [] } }), false);
  assert.equal(chats.isChatAction({ ...actions[0], kind: 'future_action' }), false);
  for (const patch of [{ result_id: {} }, { status: 'unknown' }, { source_timestamp: 2 }, { expires_at: null }, { source_sender: [] }])
    assert.equal(chats.isChatAction({ ...actions[0], ...patch }), false);
  assert.equal(chats.isChatAction({ ...actions[0], execution_status: 'provider-status', source_channel: 'provider-channel', source_sender: null, source_timestamp: null }), true);
});

test('action HTTP helpers validate guarded actions and preserve filters and encoded paths', async () => {
  await responds(actions, async calls => {
    assert.deepEqual(await chats.getChatActions('c/a', undefined, 't'), actions);
    assert.equal(calls[0][0], '/api/chats/c%2Fa/actions?limit=100&offset=0&turn_id=t');
  });
  for (const helper of [() => chats.confirmChatAction('c', 'a'), () => chats.rejectChatAction('c', 'a')]) {
    await responds(actions[0], async () => assert.deepEqual(await helper(), actions[0]));
    await responds({ ...actions[0], payload: category }, async () => assert.rejects(helper, chats.ChatsApiError));
  }
  await responds([null], async () => assert.rejects(chats.getChatActions('c'), chats.ChatsApiError));
});

test('HTTP boundaries reject malformed JSON and safely handle untrusted error envelopes', async () => {
  for (const body of [null, [], 'oops', { detail: [], message: { nested: true } }])
    await responds(body, async () => assert.rejects(chats.getChat('c'), error => error instanceof chats.ChatsApiError && typeof error.message === 'string'), 500);
  await responds({ detail: 'Chat not found' }, async () => assert.rejects(chats.getChat('c'), error => error instanceof chats.ChatsApiError && error.detail === 'Chat not found'), 404);
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{invalid', { status: 200 });
  try { await assert.rejects(chats.getChat('c'), chats.ChatsApiError); } finally { globalThis.fetch = original; }
});

for (const [label, action] of [
  ['transaction decimal', { ...actions[3], payload: { ...transaction, amount: 'not-money' } }],
  ['transaction currency', { ...actions[3], payload: { ...transaction, currency: 'invalid-currency' } }],
  ['transaction parseable non-ISO date', { ...actions[3], payload: { ...transaction, date: '0' } }],
  ['calendar parseable non-ISO timestamp', { ...actions[0], payload: { ...calendar, starts_at: '0' } }],
  ['action expiry timestamp', { ...actions[0], expires_at: '0' }],
  ['revision timestamp', { ...actions[1], payload: { ...actions[1].payload, expected_updated_at: '0' } }],
]) {
  test(`chat semantic boundary rejects ${label}`, async () => {
    await responds([action], async () => assert.rejects(chats.getChatActions('c'), chats.ChatsApiError));
  });
}

test('chat semantic boundaries preserve decimal exponents, currency codes, nullable reminders and ISO offsets', async () => {
  const values = [
    { ...actions[3], payload: { ...transaction, amount: '1E+2', currency: 'USD' } },
    { ...actions[0], payload: { ...calendar, starts_at: '2026-11-06T12:00:00.123456+03:00', remind_at: null, ends_at: null } },
  ];
  await responds(values, async () => assert.deepEqual(await chats.getChatActions('c'), values));
});
