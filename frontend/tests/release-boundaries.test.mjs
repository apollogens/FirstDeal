import assert from 'node:assert/strict';
import test from 'node:test';
import { getContexts, createContextChat } from '../src/lib/contexts.ts';
import { getTrackedTopics } from '../src/lib/tracked-topics.ts';
import { getVersionInfo } from '../src/lib/version.ts';
import { getDatasets, uploadDataset, runDatasetBenchmark, resetDatasets, exportProfile } from '../src/lib/datasets.ts';
import { getMailAccounts, getMailMessages, getMailMessage, disconnectMailAccount, syncMailAccounts, syncMailAccount } from '../src/lib/mail.ts';
import { getMemoryFacts, getMemoryFact, getMemoryAttention, archiveMemoryFact, getMemoryDecision } from '../src/lib/memory.ts';
import { getNotifications, getUnreadNotificationCount, confirmNotificationAction } from '../src/lib/notifications.ts';
import { getTelegramConnection, createTelegramLink, disconnectTelegram } from '../src/lib/telegram.ts';
import { getIntegrationsStatus } from '../src/lib/integrations.ts';
import { normalizeDocument } from '../src/features/documents-v2/adapters/documentViewModel.ts';

const stamp = '2026-11-06T12:00:00+03:00';
const context = { id: 'context', title: 'Period', date_from: stamp, date_to: stamp, items: [], created_at: stamp, updated_at: stamp };

test('context API validates nested items and preserves nullable chat context_id', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([context]));
  assert.deepEqual(await getContexts(), [context]);
  globalThis.fetch.mock.mockImplementation(async () => Response.json([{ ...context, items: [{ source_type: 'invented', source_id: 'id', occurred_at: stamp }] }]));
  await assert.rejects(getContexts(), { status: 502 });
  const response = { chat: { id: 'chat', user_id: 'user', context_id: null, title: 'Chat', created_at: stamp, updated_at: stamp }, context };
  globalThis.fetch.mock.mockImplementation(async () => Response.json(response));
  assert.deepEqual(await createContextChat('context'), response);
});

test('context errors safely format malformed validation locations', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: [null, {}, { loc: ['body', { unsafe: true }, 'date_from'], msg: 'Invalid date' }] }, { status: 422 }));
  await assert.rejects(getContexts(), error => error.status === 422 && error.message.includes('body.date_from: Invalid date') && !error.message.includes('[object Object]'));
});

test('tracked topics reject partial lists, invalid scope and numeric query', async t => {
  const topic = { id: 'topic', user_id: 'user', query: 'Frontend', scope: 'work', check_interval_minutes: 60, last_checked_at: null, next_check_at: stamp, created_at: stamp, updated_at: stamp };
  t.mock.method(globalThis, 'fetch', async () => Response.json([topic]));
  assert.deepEqual(await getTrackedTopics(), [topic]);
  for (const value of [null, {}, [null], [{ ...topic, scope: 'invalid' }], [{ ...topic, query: 1 }]]) {
    globalThis.fetch.mock.mockImplementation(async () => Response.json(value));
    await assert.rejects(getTrackedTopics(), { status: 502 });
  }
});

test('version info rejects an incomplete success payload rather than trusting Promise<any>', async t => {
  const version = { app_name: 'Workspace AI', version: 'test', commit_sha: 'local', branch: 'local', build_date: 'local', environment: 'fixture', database_revision: 'none' };
  t.mock.method(globalThis, 'fetch', async () => Response.json(version));
  assert.deepEqual(await getVersionInfo(), version);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ version: 'test' }));
  await assert.rejects(getVersionInfo(), /некорректные/);
});

test('dataset endpoints validate reports, import rejects and nested profile evidence', async t => {
  const dataset = { id: 'dataset', name: 'Demo', source_type: 'email', status: 'ready', items_count: 1, error_message: null, created_at: stamp };
  const imported = { dataset_id: 'dataset', name: 'Demo', source_type: 'email', items_imported: 1, facts_extracted: 1, status: 'ready', rejected_lines: [{ line_number: 2, reason: 'Invalid JSON', sample: null }] };
  const benchmark = { total: 1, passed: 1, score_percentage: 100, items: [{ question: 'Q', expected: ['A'], actual: 'A', passed: true }] };
  const reset = { datasets_deleted: 1, dataset_items_deleted: 1, facts_deleted: 1, calendar_events_deleted: 0, evidence_deleted: 1 };
  const profile = { user_id: 'user', generated_at: stamp, active_facts_count: 1, facts: [{ fact_id: 'fact', scope: 'work', subject_type: 'person', subject: 'Demo', fact_key: 'preference', fact_type: 'preference', value: { arbitrary: ['safe', 2] }, confidence: 1, last_observed_at: stamp, provenance: [{ evidence_id: 'evidence', source_type: 'email', source_id: null, observed_at: stamp, evidence_text: 'Demo', evidence_location: {} }] }] };
  t.mock.method(globalThis, 'fetch', async url => Response.json(url.endsWith('/profile/export') ? profile : url.endsWith('/upload') ? imported : url.endsWith('/benchmark') ? benchmark : url.endsWith('/reset') ? reset : [dataset]));
  assert.deepEqual(await getDatasets(), [dataset]);
  assert.deepEqual(await uploadDataset(new File(['{}'], 'demo.jsonl'), 'email'), imported);
  assert.deepEqual(await runDatasetBenchmark(), benchmark);
  assert.deepEqual(await resetDatasets(), reset);
  assert.deepEqual(await exportProfile(), profile);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ ...profile, facts: [{ ...profile.facts[0], provenance: [null] }] }));
  await assert.rejects(exportProfile(), { status: 502 });
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ ...benchmark, items: [{ question: 'Q', expected: 'not-an-array', actual: 'A', passed: true }] }));
  await assert.rejects(runDatasetBenchmark(), { status: 502 });
});

test('mail accepts schema-null account_id, validates recipients and preserves 204 disconnect', async t => {
  const account = { id: 'account', provider: 'gmail', email: 'demo@example.test', status: 'connected' };
  const message = { id: 'mail', account_id: null, delivery_status: 'sent', from_name: null, from_email: 'demo@example.test', subject: 'Demo', preview: '', received_at: stamp, is_read: false, body_text: 'Text', to_recipients: [{ email: 'recipient@example.test', name: null }] };
  t.mock.method(globalThis, 'fetch', async url => url.endsWith('/disconnect') ? new Response(null, { status: 204 }) : Response.json(url.endsWith('/accounts') || url.endsWith('/accounts/sync') ? [account] : url.includes('/sync?') ? { synced_messages_count: 1, extracted_facts_count: 0 } : url.includes('/messages?') ? { items: [message], total: 1 } : message));
  assert.deepEqual(await getMailAccounts(), [account]);
  assert.equal((await getMailMessages({})).items[0].account_id, null);
  assert.deepEqual(await getMailMessage('mail'), message);
  assert.deepEqual(await syncMailAccounts(), [account]);
  assert.deepEqual(await syncMailAccount('account'), { synced_messages_count: 1, extracted_facts_count: 0 });
  assert.equal(await disconnectMailAccount('account'), undefined);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ ...message, to_recipients: [null] }));
  await assert.rejects(getMailMessage('mail'), { status: 502 });
});

test('memory validates nested evidence and decisions without constraining domain value JSON', async t => {
  const fact = { id: 'fact', scope: 'work', subject_type: 'person', subject: 'Demo', fact_type: 'preference', predicate: 'preference', value: { nested: [1, null] }, status: 'active', confidence: 1, valid_from: null, valid_to: null, supersedes_fact_id: null, last_observed_at: stamp, evidence: [{ id: 'evidence', source_type: 'manual', source_id: 'source', source_version: null, observed_at: stamp, evidence_text: 'Demo', evidence_location: {} }] };
  const decision = { id: 'decision', scope: 'work', decision_type: 'demo', decision_key: 'demo', payload: {}, status: 'valid', dependency_fact_ids: ['fact'], updated_at: stamp };
  t.mock.method(globalThis, 'fetch', async url => url.endsWith('/archive') ? new Response(null, { status: 204 }) : Response.json(url.includes('/facts?') ? [fact] : url.includes('/decisions/') ? decision : url.includes('/attention') ? [] : fact));
  assert.deepEqual(await getMemoryFacts(), [fact]);
  assert.deepEqual(await getMemoryFact('fact'), fact);
  assert.deepEqual(await getMemoryDecision('decision'), decision);
  assert.deepEqual(await getMemoryAttention(), []);
  assert.equal(await archiveMemoryFact('fact'), undefined);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ ...fact, evidence: [{ ...fact.evidence[0], evidence_location: [] }] }));
  await assert.rejects(getMemoryFact('fact'), { status: 502 });
});

test('notification kind selects the right payload and rejects unsafe news links', async t => {
  const meta = { id: 'notification', status: 'unread', title: 'Demo', body: 'Demo', read_at: null, dismissed_at: null, created_at: stamp, updated_at: stamp };
  const memory = { ...meta, kind: 'memory_changed', payload: { fact_id: null, decision_id: null, proposal_action_id: null, severity: 'medium', action_payload: { title: 'Meeting', starts_at: stamp, ends_at: null, location: null }, citations: [{ source_type: 'email', source_id: null, fact_value: null }] } };
  const reminder = { ...meta, kind: 'calendar_reminder', payload: { reminder_id: 'reminder', title: 'Reminder', remind_at: stamp } };
  t.mock.method(globalThis, 'fetch', async url => Response.json(url.endsWith('/unread-count') ? { count: 2 } : url.endsWith('/confirm') ? { notification_id: 'notification', action_status: 'confirmed', created_event_id: null, status: 'read', action_type: 'create_calendar_event' } : [memory, reminder], { headers: { 'X-Unavailable-Notifications': 'NaN' } }));
  assert.deepEqual(await getNotifications(), { items: [memory, reminder], unavailableCount: 0 });
  assert.deepEqual(await getUnreadNotificationCount(), { count: 2 });
  assert.equal((await confirmNotificationAction('notification')).action_status, 'confirmed');
  const news = { ...meta, kind: 'news_digest', payload: { topic_id: 'topic', topic: 'Frontend', scope: 'work', items: [{ title: 'News', url: 'javascript:alert(1)', source: 'Demo', published_at: null }] } };
  globalThis.fetch.mock.mockImplementation(async () => Response.json([news]));
  await assert.rejects(getNotifications(), { status: 502 });
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ count: -1 }));
  await assert.rejects(getUnreadNotificationCount(), { status: 502 });
});

test('Telegram validates connection, restricts generated links and confirms disconnect', async t => {
  const connection = { connected: false, username: null, last_seen: null, bot_url: null, groups: [] };
  t.mock.method(globalThis, 'fetch', async (url, options) => Response.json(options?.method === 'DELETE' ? { connected: false } : url.endsWith('/link') ? { deep_link: 'https://t.me/example_bot?start=fictional' } : connection));
  assert.deepEqual(await getTelegramConnection(), connection);
  assert.match(await createTelegramLink('private'), /^https:\/\/t.me\//);
  assert.deepEqual(await disconnectTelegram(), { connected: false });
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ deep_link: 'https://attacker.example.test/' }));
  await assert.rejects(createTelegramLink('private'), /Некорректная/);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ ...connection, groups: [null] }));
  await assert.rejects(getTelegramConnection(), /некорректное/);
});

test('integration registry requires bounded limits and scenario data for populated items', async t => {
  const registry = { items: [], total: 0, healthy_count: 0, timestamp: stamp };
  t.mock.method(globalThis, 'fetch', async () => Response.json(registry));
  assert.deepEqual(await getIntegrationsStatus(), registry);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ ...registry, items: [{ id: 'partial' }] }));
  await assert.rejects(getIntegrationsStatus(), /некорректный/);
});

test('optional document metadata cannot inject unsafe links or non-renderable values', () => {
  const document = { id: 'document', filename: 'demo.pdf', file_size: 10, mime_type: 'application/pdf', scope: 'work', status: 'ready', pages_count: 1, created_at: stamp, available_at: stamp };
  const malformed = normalizeDocument({ ...document, summary: { html: '<script>unsafe</script>' }, importance: 'invented', insights: { obligations_count: 'many' }, related_items: [{ id: 'link', type: 'chat', title: 'Unsafe', href: 'javascript:alert(1)' }] });
  assert.equal(malformed.summary, null);
  assert.equal(malformed.importance, 'unknown');
  assert.equal(malformed.insights, null);
  assert.deepEqual(malformed.relatedItems, []);
  const valid = { id: 'related', type: 'chat', title: 'Related', href: '/workspace?chat=demo' };
  assert.deepEqual(normalizeDocument({ ...document, related_items: [valid] }).relatedItems, [valid]);
});
