// Isolated local fixtures. Never connect this server to real credentials or data.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const user = { id: 'portfolio-demo', email: 'alex@example.test', full_name: 'Алекс Миров · Демо', role: 'employee', manager_id: null, timezone: 'Europe/Moscow', is_active: true };
const now = new Date();
const stamp = now.toISOString();
const date = stamp.slice(0, 10);
const tasks = [
  { id: 'demo-task-1', user_id: user.id, title: 'Подготовить обзор проекта «Орбита»', description: 'Собрать результаты исследования и выбрать три примера для презентации.', scope: 'work', priority: 'high', status: 'todo', due_date: date, created_at: stamp, updated_at: stamp },
  { id: 'demo-task-2', user_id: user.id, title: 'Проверить бюджет команды', description: 'Сверить категории расходов за текущий месяц.', scope: 'work', priority: 'medium', status: 'in_progress', due_date: date, created_at: stamp, updated_at: stamp },
];
const categories = ['Исследования', 'Инструменты'].map((name, i) => ({ id: `demo-cat-${i}`, user_id: user.id, name, type: 'expense', created_at: stamp, updated_at: stamp }));
const transactions = categories.map((category, i) => ({ id: `demo-tx-${i}`, user_id: user.id, category_id: category.id, scope: 'work', amount: i ? '2500' : '7500', currency: 'RUB', type: 'expense', date, description: i ? 'Лицензия для макетов · Демо' : 'Исследование проекта «Орбита» · Демо', created_at: stamp, updated_at: stamp }));
const eventStart = new Date(now); eventStart.setHours(14, 0, 0, 0);
const events = [{ id: 'demo-event-1', user_id: user.id, title: 'Обзор проекта «Орбита» · Демо', description: 'Обсудить результаты исследования.', scope: 'work', starts_at: eventStart.toISOString(), ends_at: new Date(+eventStart + 3600000).toISOString(), location: 'Переговорная «Север»', remind_at: new Date(+eventStart - 1800000).toISOString(), reminder_sent_at: null, created_at: stamp, updated_at: stamp }];
const documents = [{ id: 'demo-doc-1', user_id: user.id, filename: 'Орбита — план исследования (демо).pdf', scope: 'work', file_size: 48192, mime_type: 'application/pdf', status: 'uploaded', error_message: null, pages_count: null, chunks_count: 0, available_at: null, content_hash: null, source_group_id: null, version: 1, supersedes_document_id: null, memory_status: null, memory_attempt_count: null, memory_processed_at: null, created_at: stamp, updated_at: stamp }];
const mock = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (path === '/api/v1/auth/me') return res.end(JSON.stringify(user));
  if (path === '/api/v1/auth/login') return res.end(JSON.stringify({ access_token: 'portfolio-fixture', refresh_token: 'portfolio-fixture-refresh', token_type: 'bearer' }));
  const send = data => res.end(JSON.stringify(data));
  // Read-only fixture endpoints; writes fail explicitly and never reach a real service.
  if (req.method === 'GET') {
    if (path === '/api/v1/documents/demo-doc-1/download') {
      const bytes = gzipSync(Buffer.from([0, 1, 2, 127, 128, 255]));
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="fixture.bin"');
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', bytes.length);
      return res.end(bytes);
    }
    if (path === '/api/v1/tasks') return send(tasks.filter(item => ['status', 'scope', 'priority'].every(key => !url.searchParams.get(key) || url.searchParams.get(key) === item[key])));
    if (path === '/api/v1/finance/summary') return send({ currency: 'RUB', income: '0', expense: '10000', balance: '-10000' });
    if (path === '/api/v1/finance/transactions') return send(transactions);
    if (path === '/api/v1/finance/categories') return send(categories);
    if (path === '/api/v1/calendar/events') return send(events.filter(event => (!url.searchParams.get('date_from') || event.starts_at >= url.searchParams.get('date_from')) && (!url.searchParams.get('date_to') || event.starts_at <= url.searchParams.get('date_to'))));
    if (path === '/api/v1/documents') return send(documents);
    if (path === '/api/v1/notifications/unread-count') return send({ count: 0 });
    if (path === '/api/v1/mail/messages') return send({ items: [], total: 0 });
    if (path === '/api/v1/integrations/status') return send({ items: [], total: 0, healthy_count: 0, timestamp: stamp });
    if (path === '/api/v1/telegram/connection') return send({ connected: false, username: null, last_seen: null, bot_url: null, groups: [] });
    if (['/api/v1/memory/facts', '/api/v1/memory/attention', '/api/v1/contexts'].includes(path)) return send([]);
    if (['/api/v1/chats', '/api/v1/notifications', '/api/v1/mail/accounts', '/api/v1/calendar/free-slots', '/api/v1/calendar/connections', '/api/v1/finance/goals', '/api/v1/tracked-topics', '/api/v1/datasets'].includes(path)) return send([]);
    if (path === '/api/v1/version') return send({ app_name: 'Workspace AI · Demo fixtures', version: 'portfolio', commit_sha: 'local', branch: 'local', database_revision: 'none', environment: 'isolated demo', build_date: stamp });
  }
  res.statusCode = 503;
  res.end(JSON.stringify({ detail: 'Portfolio fixture: external integration unavailable' }));
});
mock.listen(3211, '127.0.0.1', () => {
  console.log('ISOLATED PORTFOLIO DEMO: fictional read-only fixtures. Sign in at http://127.0.0.1:3210 using any example.test address and a fictitious 8+ character password. No live AI, uploads, mutations or external connections.');
  const mode = process.env.PORTFOLIO_QA_MODE === 'production' ? 'production' : 'development';
  const args = mode === 'production' ? ['start'] : ['dev', '--webpack'];
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...args, '-H', '127.0.0.1', '-p', '3210'], {
    stdio: 'inherit',
    env: { ...process.env, PORTFOLIO_QA: '1', AUTH_API_URL: 'http://127.0.0.1:3211', NEXT_PUBLIC_WS_API_URL: 'http://127.0.0.1:3211', AUTH_APP_ORIGIN: 'http://127.0.0.1:3210', AUTH_APP_ORIGINS: 'http://127.0.0.1:3210' },
  });
  child.on('exit', code => { mock.close(); process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(signal); mock.close(); });
});
