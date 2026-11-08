import type { Page } from '@playwright/test';
import { documentFixture } from '../portfolio/fixtures';

export function watchThemeRuntime(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (/hydration|did not match/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

export const stamp = '2026-11-08T09:00:00+03:00';
export const user = { id: 'portfolio-demo', email: 'alex@example.test', full_name: 'Алекс Миров · Демо', role: 'employee', manager_id: null, timezone: 'Europe/Moscow', is_active: true };
export const chat = { id: 'theme-chat', user_id: user.id, title: 'План исследования · Демо', context_id: null, created_at: stamp, updated_at: stamp };
export const task = { id: 'theme-task', user_id: user.id, title: 'Подготовить обзор исследования', description: 'Вымышленная задача для проверки темы.', scope: 'work', priority: 'high', status: 'todo', due_date: '2026-11-09T12:00:00+03:00', created_at: stamp, updated_at: stamp };
const category = { id: 'theme-category', user_id: user.id, name: 'Исследования', type: 'expense', created_at: stamp, updated_at: stamp };
const transaction = { id: 'theme-tx', user_id: user.id, category_id: category.id, scope: 'work', amount: '7500', currency: 'RUB', type: 'expense', date: '2026-11-08', description: 'Демо: исследование', created_at: stamp, updated_at: stamp };
const event = { id: 'theme-event', user_id: user.id, title: 'Обзор проекта · Демо', description: 'Вымышленное событие.', scope: 'work', starts_at: stamp, ends_at: '2026-11-08T10:00:00+03:00', location: 'Демо-комната', remind_at: '2026-11-08T08:30:00+03:00', reminder_sent_at: null, created_at: stamp, updated_at: stamp };
const account = { id: 'theme-account', provider: 'gmail', email: 'demo@example.test', status: 'connected' };
export const message = { id: 'theme-message', account_id: account.id, from_name: 'Демо-команда', from_email: 'team@example.test', subject: 'Обзор исследования', preview: 'Вымышленное письмо для проверки темы.', received_at: stamp, is_read: false, body_text: 'Вымышленное письмо. Проверяем читабельность текста и элементов управления.', to_recipients: [{ email: account.email }] };
const notification = { id: 'theme-notification', kind: 'calendar_reminder', status: 'unread', title: 'Встреча по проекту', body: 'Вымышленное напоминание.', payload: { event_id: event.id, scope: 'work', title: event.title, starts_at: stamp, ends_at: event.ends_at, location: event.location, remind_at: event.remind_at }, read_at: null, dismissed_at: null, created_at: stamp, updated_at: stamp };
export const fact = { id: 'theme-fact', scope: 'work', subject_type: 'project', subject: 'Демо проект', fact_type: 'project', predicate: 'планирование', value: 'Подготовить обзор исследования.', status: 'active', confidence: 0.9, valid_from: stamp, valid_to: null, supersedes_fact_id: null, last_observed_at: stamp, evidence: [] };

export async function mockThemeApi(page: Page, populated = true) {
  await page.route('**/api/**', route => {
    const p = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (p === '/api/auth/socket') return route.continue();
    if (route.request().method() !== 'GET') {
      if (p.endsWith('/read')) return route.fulfill({ json: { ...message, is_read: true } });
      return route.fulfill({ status: 503, json: { detail: 'Демо: операция недоступна.' } });
    }
    let json: unknown = [];
    if (p === '/api/auth/session') json = { user };
    else if (p === '/api/version') json = { app_name: 'Workspace AI', version: 'theme-qa', commit_sha: 'fixture', branch: 'local', build_date: stamp, database_revision: 'none', environment: 'isolated demo' };
    else if (p === '/api/chats') json = populated ? [chat] : [];
    else if (p === `/api/chats/${chat.id}`) json = chat;
    else if (p.endsWith('/messages') && p.startsWith('/api/chats')) json = { items: [], next_before_sequence: null };
    else if (p === '/api/tasks') json = populated ? [task] : [];
    else if (p.endsWith('/finance/summary')) json = populated ? { income: '10000', expense: '7500', balance: '2500', currency: 'RUB' } : { income: '0', expense: '0', balance: '0', currency: 'RUB' };
    else if (p.endsWith('/finance/categories')) json = [category];
    else if (p.endsWith('/finance/transactions')) json = populated ? [transaction] : [];
    else if (p.endsWith('/calendar/events')) json = populated ? [event] : [];
    else if (p === '/api/documents') json = populated ? [documentFixture({ id: 'theme-document', filename: 'Исследование (демо).pdf', user_id: user.id, summary: 'Вымышленный документ для проверки темы.', created_at: stamp, updated_at: stamp, category: 'reports', importance: 'important' })] : [];
    else if (p === '/api/memory/facts') json = populated ? [fact] : [];
    else if (p === '/api/notifications/unread-count') json = { count: populated ? 1 : 0 };
    else if (p === '/api/notifications') json = populated ? [notification] : [];
    else if (p === '/api/mail/accounts') json = page.url().includes('/mail/connect') ? [] : [account];
    else if (p === '/api/mail/messages') json = { items: populated ? [message] : [], total: populated ? 1 : 0 };
    else if (p === `/api/mail/messages/${message.id}`) json = message;
    else if (p === '/api/integrations/status') json = { items: [], total: 0, healthy_count: 0, timestamp: stamp };
    else if (p === '/api/telegram/connection') json = { connected: false, username: null, last_seen: null, bot_url: null, groups: [] };
    return route.fulfill({ json });
  });
}

export const routes = [
  { key: 'root', url: '/', heading: 'Войдите в Workspace AI' },
  { key: 'login', url: '/login', heading: 'Войдите в Workspace AI' },
  { key: 'profile', url: '/profile', heading: 'Личный кабинет' },
  { key: 'mail', url: '/mail', heading: 'Почта' },
  { key: 'mail-connect', url: '/mail/connect', heading: 'Подключите почту' },
  { key: 'mail-inbox', url: '/mail/inbox', heading: 'Почта' },
  ...[['chat', 'giga', 'Новый чат'], ['finance', 'finance', 'Финансы'], ['calendar', 'calendar', 'Календарь'], ['tasks', 'tasks', 'Задачи'], ['documents', 'documents', 'Документы'], ['memory', 'memory', 'Память'], ['history', 'history', 'История чатов'], ['settings', 'settings', 'Настройки']].map(([key, section, heading]) => ({ key, url: `/workspace?section=${section}`, heading })),
];
