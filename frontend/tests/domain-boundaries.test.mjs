import test from 'node:test';
import assert from 'node:assert/strict';
import * as calendar from '../src/lib/calendar.ts';
import * as finance from '../src/lib/finance.ts';
import * as documents from '../src/lib/documents.ts';

const event = { id: 'e', user_id: 'u', title: 'Meeting', description: '', starts_at: '2026-01-01T10:00:00Z', ends_at: null, location: null, remind_at: '2026-01-01T09:00:00Z', reminder_sent_at: null, created_at: '2026-11-06T12:00:00Z', updated_at: '2026-11-06T12:00:00Z' };
const connection = { id: 'c', provider: 'google', account_label: null, calendar_id: 'primary', calendar_name: null, calendar_timezone: null, status: 'active', is_default: true, last_synced_at: null, last_error: null };
const category = { id: 'c', user_id: null, name: 'Food', type: 'expense', created_at: '2026-11-06T12:00:00Z', updated_at: '2026-11-06T12:00:00Z' };
const transaction = { id: 't', user_id: 'u', category_id: 'c', scope: 'personal', amount: '12.50', currency: 'RUB', type: 'expense', date: '2026-01-01', description: '', created_at: '2026-11-06T12:00:00Z', updated_at: '2026-11-06T12:00:00Z' };
const summary = { currency: 'RUB', income: '100.00', expense: '12.50', balance: '87.50' };
const goal = { id: 'g', user_id: 'u', scope: 'work', title: 'Goal', description: '', target_amount: '100.00', current_amount: 20, currency: 'RUB', target_date: null, is_completed: false, progress_percent: 20, remaining_amount: '80.00', created_at: '2026-11-06T12:00:00Z', updated_at: '2026-11-06T12:00:00Z' };
const document = { id: 'd', user_id: 'u', scope: 'personal', filename: 'test.pdf', file_size: 1, mime_type: 'application/pdf', status: 'future-status', error_message: null, pages_count: null, chunks_count: 0, available_at: null, content_hash: null, source_group_id: null, version: null, supersedes_document_id: null, memory_status: null, memory_attempt_count: null, memory_processed_at: null, created_at: '2026-11-06T12:00:00Z', updated_at: '2026-11-06T12:00:00Z' };
const searchResult = { chunk_id: 'c', document_id: 'd', filename: 'test.pdf', chunk_index: 0, page_number: null, content: 'text', score: 0.9 };

async function responds(body, action, status = 200) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  try { return await action(calls); } finally { globalThis.fetch = original; }
}

test('calendar helpers validate endpoint DTOs and retain optional legacy fields', async () => {
  await responds([event], async calls => {
    assert.deepEqual(await calendar.getCalendarEvents({ limit: 5, offset: 10, scope: 'work' }), [event]);
    assert.equal(calls[0][0], '/api/calendar/events?limit=5&offset=10&scope=work');
  });
  for (const helper of [() => calendar.createCalendarEvent({ title: 'Meeting', starts_at: '2026-11-06T12:00:00Z' }), () => calendar.updateCalendarEvent('e', { title: 'New' })]) {
    await responds(event, async () => assert.deepEqual(await helper(), event));
    await responds({ ...event, starts_at: 42 }, async () => assert.rejects(helper, calendar.CalendarApiError));
  }
  await responds([connection], async () => assert.deepEqual(await calendar.getCalendarConnections(), [connection]));
  await responds([connection], async () => assert.deepEqual(await calendar.discoverCalendarConnections(), [connection]));
  await responds(connection, async () => assert.deepEqual(await calendar.updateCalendarConnection('c', 'primary'), connection));
  await responds([{ id: 'primary', name: 'Work', timezone: null, primary: true, access_role: null }], async () => assert.equal((await calendar.getExternalCalendars('c'))[0].primary, true));
  await responds({ connect_link_url: 'https://example.com' }, async () => assert.equal((await calendar.getGoogleCalendarConnectUrl()).connect_link_url, 'https://example.com'));
  await responds({ events_created: 3 }, async () => assert.deepEqual(await calendar.syncCalendarConnection('c'), { events_created: 3 }));
  await responds({ events_created: '3' }, async () => assert.rejects(calendar.syncCalendarConnection('c'), calendar.CalendarApiError));
  await responds([{ ...event, scope: 'other' }], async () => assert.rejects(calendar.getCalendarEvents({}), calendar.CalendarApiError));
  await responds([{ ...event, remind_at: null }], async () => assert.rejects(calendar.getCalendarEvents({}), calendar.CalendarApiError));
});

test('finance helpers validate decimals, enums, nullable fields and goal number compatibility', async () => {
  await responds(summary, async () => assert.deepEqual(await finance.getFinanceSummary({}), summary));
  await responds([category], async () => assert.deepEqual(await finance.getCategories(), [category]));
  for (const helper of [() => finance.createCategory({ name: 'Food', type: 'expense' }), () => finance.updateCategory('c', { name: 'Food' })])
    await responds(category, async () => assert.deepEqual(await helper(), category));
  await responds([transaction], async calls => {
    assert.deepEqual(await finance.getTransactions({ limit: 2, offset: 4 }), [transaction]);
    assert.equal(calls[0][0], '/api/finance/transactions?limit=2&offset=4');
  });
  for (const helper of [() => finance.createTransaction(transaction), () => finance.updateTransaction('t', { description: '' })])
    await responds(transaction, async () => assert.deepEqual(await helper(), transaction));
  await responds([goal], async () => assert.deepEqual(await finance.getGoals(), [goal]));
  for (const helper of [() => finance.createGoal({ title: 'Goal', target_amount: 100 }), () => finance.updateGoal('g', { is_completed: true })])
    await responds(goal, async () => assert.deepEqual(await helper(), goal));
  for (const [bad, helper] of [[{ ...summary, income: {} }, () => finance.getFinanceSummary({})], [[{ ...category, type: 'other' }], () => finance.getCategories()], [[{ ...transaction, amount: 12.5 }], () => finance.getTransactions({})], [[{ ...goal, is_completed: 'yes' }], () => finance.getGoals()]])
    await responds(bad, async () => assert.rejects(helper, finance.FinanceApiError));
});

test('document helpers preserve future statuses, pagination and multipart upload', async () => {
  await responds([document], async calls => {
    assert.deepEqual(await documents.getDocuments('work', undefined, 'ready'), [document]);
    assert.equal(calls[0][0], '/api/documents?limit=100&offset=0&scope=work&status=ready');
  });
  await responds(document, async () => assert.deepEqual(await documents.getDocument('d'), document));
  await responds(document, async calls => {
    assert.deepEqual(await documents.uploadDocument(new File(['x'], 'test.pdf'), 'personal', 'old'), document);
    assert.equal(calls[0][1].body.get('replaces_document_id'), 'old');
    assert.equal(calls[0][1].headers, undefined);
  });
  await responds([searchResult], async () => assert.deepEqual(await documents.searchDocuments('text', ''), [searchResult]));
  for (const patch of [{ file_size: '1' }, { version: '2' }, { memory_status: [] }, { scope: 'other' }])
    await responds({ ...document, ...patch }, async () => assert.rejects(documents.getDocument('d'), documents.DocumentsApiError));
  await responds([{ ...searchResult, score: 2 }], async () => assert.rejects(documents.searchDocuments('text', ''), documents.DocumentsApiError));
});

test('error boundaries ignore malformed messages and validation locations', async () => {
  for (const [helper, ErrorClass] of [[() => calendar.getCalendarEvents({}), calendar.CalendarApiError], [() => finance.getCategories(), finance.FinanceApiError]]) {
    await responds({ message: { nested: true }, detail: [null, { loc: 'bad' }, { loc: ['body', 3] }, { loc: ['body', 'title'] }] }, async () => {
      await assert.rejects(helper, error => error instanceof ErrorClass && typeof error.message === 'string' && Object.keys(error.fields).join() === 'title');
    }, 422);
    for (const body of [null, [], 'oops', { message: [] }])
      await responds(body, async () => assert.rejects(helper, error => error instanceof ErrorClass && typeof error.message === 'string'), 500);
  }
  await responds({ detail: { bad: true }, message: [] }, async () => assert.rejects(documents.getDocument('d'), documents.DocumentsApiError), 500);
});

test('successful malformed JSON is rejected and empty deletes retain public results', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{invalid', { status: 200 });
  try {
    await assert.rejects(calendar.getCalendarEvents({}), calendar.CalendarApiError);
    await assert.rejects(finance.getCategories(), finance.FinanceApiError);
    await assert.rejects(documents.getDocument('d'), documents.DocumentsApiError);
  } finally { globalThis.fetch = original; }
  for (const helper of [() => calendar.deleteCalendarEvent('e'), () => calendar.disconnectCalendarConnection('c'), () => finance.deleteCategory('c'), () => finance.deleteTransaction('t'), () => finance.deleteGoal('g')])
    await responds(null, async () => assert.equal(await helper(), null), 204);
  await responds(null, async () => assert.equal(await documents.deleteDocument('d'), undefined), 204);
});

// Transport semantics consumed by Number/Intl/Date in the finance and calendar screens.
for (const [label, helper, body] of [
  ['transaction decimal', () => finance.getTransactions({}), [{ ...transaction, amount: 'not-money' }]],
  ['summary decimal', () => finance.getFinanceSummary({}), { ...summary, balance: 'not-money' }],
  ['goal decimal', () => finance.getGoals(), [{ ...goal, target_amount: 'not-money' }]],
  ['goal infinite decimal', () => finance.getGoals(), [{ ...goal, remaining_amount: 'Infinity' }]],
  ['transaction currency', () => finance.getTransactions({}), [{ ...transaction, currency: 'invalid-currency' }]],
  ['calendar start timestamp', () => calendar.getCalendarEvents({}), [{ ...event, starts_at: 'bad-date' }]],
  ['calendar end timestamp', () => calendar.getCalendarEvents({}), [{ ...event, ends_at: 'bad-date' }]],
  ['calendar parseable non-ISO timestamp', () => calendar.getCalendarEvents({}), [{ ...event, starts_at: '0' }]],
  ['transaction ISO date', () => finance.getTransactions({}), [{ ...transaction, date: '0' }]],
  ['transaction timestamp', () => finance.getTransactions({}), [{ ...transaction, created_at: 'bad-date' }]],
  ['goal ISO target date', () => finance.getGoals(), [{ ...goal, target_date: 'bad-date' }]],
]) {
  test(`semantic boundary rejects ${label}`, async () => {
    await responds(body, async () => assert.rejects(helper, error => error instanceof calendar.CalendarApiError || error instanceof finance.FinanceApiError));
  });
}

test('semantic boundaries preserve signed/exponent decimals, goal numbers, nulls and ISO offsets', async () => {
  const offsetEvent = { ...event, starts_at: '2026-11-06T12:00:00.123456+03:00', ends_at: null };
  await responds([offsetEvent], async () => assert.deepEqual(await calendar.getCalendarEvents({}), [offsetEvent]));
  for (const amount of ['0', '-12.50', '1E+2', '+0.25', '.5']) {
    const value = { ...transaction, amount, currency: 'USD' };
    await responds([value], async () => assert.deepEqual(await finance.getTransactions({}), [value]));
  }
  const value = { ...summary, currency: 'EUR', balance: '-1.25E+2' };
  await responds(value, async () => assert.deepEqual(await finance.getFinanceSummary({}), value));
  await responds([goal], async () => assert.deepEqual(await finance.getGoals(), [goal]));
});
