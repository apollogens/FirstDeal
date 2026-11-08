import assert from 'node:assert/strict';
import test from 'node:test';
import { createTask, deleteTask, getTasks, TaskApiError, updateTask } from '../src/lib/tasks.ts';

const task = { id: 'task-1', user_id: 'user-1', scope: 'work', title: 'Planning', description: '', due_date: null, priority: 'medium', status: 'todo', created_at: '2026-11-06T09:00:00Z', updated_at: '2026-11-06T09:00:00Z' };

function respond(t, value, status = 200) {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(value), { status }));
}

test('task list accepts the backend DTO and an empty list', async t => {
  respond(t, [task]);
  assert.deepEqual(await getTasks(), [task]);
  globalThis.fetch.mock.mockImplementation(async () => Response.json([]));
  assert.deepEqual(await getTasks(), []);
});

test('task endpoints reject null, partial objects, invalid enums and timestamps', async t => {
  for (const value of [null, {}, [null], [{ ...task, status: 'unexpected' }], [{ ...task, priority: 1 }], [{ ...task, due_date: 'invalid' }], [{ ...task, created_at: null }]]) {
    respond(t, value);
    await assert.rejects(getTasks(), error => error instanceof TaskApiError && error.status === 502);
  }
});

test('task create and update validate their response without changing requests', async t => {
  respond(t, task);
  assert.deepEqual(await createTask({ title: task.title }), task);
  assert.deepEqual(await updateTask('task/1', { status: 'done' }), task);
  const [url, options] = globalThis.fetch.mock.calls.at(-1).arguments;
  assert.equal(url, '/api/tasks/task%2F1');
  assert.equal(options.method, 'PATCH');
  assert.deepEqual(JSON.parse(options.body), { status: 'done' });
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ title: 'Partial' }));
  await assert.rejects(createTask({ title: task.title }), { status: 502 });
  await assert.rejects(updateTask(task.id, { title: task.title }), { status: 502 });
});

test('task HTTP errors use only string messages and preserve status', async t => {
  respond(t, { message: { untrusted: true } }, 422);
  await assert.rejects(getTasks(), error => error.status === 422 && typeof error.message === 'string' && !error.message.includes('[object Object]'));
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ detail: 'Task not found' }, { status: 404 }));
  await assert.rejects(getTasks(), { status: 404, message: 'Task not found' });
});

test('task delete accepts backend 204 and abort/network errors propagate', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
  assert.equal(await deleteTask(task.id), null);
  const abort = new DOMException('Cancelled', 'AbortError');
  globalThis.fetch.mock.mockImplementation(async () => { throw abort; });
  await assert.rejects(getTasks(), error => error === abort);
});

test('malformed success JSON is a controlled task API error', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{invalid'));
  await assert.rejects(getTasks(), { status: 502 });
});
