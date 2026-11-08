import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

async function evidencePath(name: string) {
  const root = process.env.QA_ARTIFACTS_DIR ?? '../artifacts/qa/after';
  await fs.mkdir(root, { recursive: true });
  return `${root}/${name}.png`;
}

for (const outcome of ['success', 'failure', 'reject']) {
  test(`chat action requires explicit confirmation: ${outcome}`, async ({ context, page }, info) => {
    await context.addCookies([{ name: 'restore_access', value: 'portfolio-fixture', domain: '127.0.0.1', path: '/' }]);
    const stamp = '2026-11-06T09:00:00Z';
    const chat = { id: 'demo-chat', user_id: 'portfolio-demo', title: 'Демо: план встречи', created_at: stamp, updated_at: stamp };
    let action = { id: 'demo-action', chat_id: chat.id, turn_id: 'demo-turn', kind: 'create_calendar_event', status: 'pending', result_id: null as string | null, expires_at: '2099-01-01T00:00:00Z', resolved_at: null, created_at: stamp, payload: { title: 'Обзор проекта · Демо', scope: 'work', description: 'Изолированная фикстура', starts_at: '2026-11-06T12:00:00Z', ends_at: '2026-11-06T13:00:00Z', location: null, remind_at: null } };
    let mutations = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== 'GET') {
        mutations++;
        await gate;
        if (outcome === 'failure') return route.fulfill({ status: 503, json: { message: 'Демо: действие не выполнено' } });
        action = { ...action, status: outcome === 'reject' ? 'rejected' : 'executed', result_id: outcome === 'reject' ? null : 'demo-event' };
        return route.fulfill({ json: action });
      }
      let body: unknown = [];
      if (path === '/api/auth/session') body = { user: { id: 'portfolio-demo', email: 'alex@example.test', full_name: 'Алекс Миров · Демо', role: 'employee', manager_id: null, timezone: 'Europe/Moscow', is_active: true } };
      else if (path.endsWith('/unread-count')) body = { count: 0 };
      else if (path === '/api/chats') body = [chat];
      else if (path === '/api/chats/demo-chat') body = chat;
      else if (path.endsWith('/messages')) body = { items: [{ id: 'demo-message', chat_id: chat.id, turn_id: 'demo-turn', sequence: 1, role: 'assistant', content: 'Демо: предлагаю создать встречу. Подтвердите действие.', model: null, prompt_tokens: null, completion_tokens: null, created_at: stamp }], next_before_sequence: null };
      else if (path.endsWith('/actions')) body = [action];
      return route.fulfill({ json: body });
    });
    await page.goto('/workspace?chat=demo-chat');
    const confirm = page.getByRole('button', { name: 'Создать событие', exact: true });
    await expect(confirm).toBeVisible();
    expect(mutations).toBe(0);
    const decision = outcome === 'reject' ? page.getByRole('button', { name: 'Отклонить', exact: true }) : confirm;
    await decision.click();
    await expect(page.getByRole('button', { name: 'Выполняю…', exact: true })).toBeDisabled();
    expect(mutations).toBe(1);
    release();
    if (outcome === 'failure') {
      await expect(page.getByText('Демо: действие не выполнено')).toBeVisible();
      await expect(confirm).toBeEnabled();
      await expect(page.getByText('Действие выполнено и сохранено.')).toHaveCount(0);
    } else {
      await expect(page.getByText(outcome === 'reject' ? 'Вы отклонили это действие.' : 'Действие выполнено и сохранено.')).toBeVisible();
    }
    expect(mutations).toBe(1);
    await page.screenshot({ path: await evidencePath(`chat-action-${outcome}-${info.project.name}`), animations: 'disabled', fullPage: true });
  });
}

test('local demo login and finance use only fictional loopback fixtures', async ({ page }, info) => {
  await page.goto('/login');
  await page.getByLabel('Электронная почта', { exact: true }).fill('alex@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('fictional-demo-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/workspace/);
  await page.goto('/workspace?section=finance');
  const chart = page.getByRole('img', { name: /Расходы/ });
  await expect(chart).toContainText('10 000');
  expect(await chart.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('conic-gradient');
  await expect(page.getByText('Исследования', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: await evidencePath(`demo-finance-${info.project.name}`), animations: 'disabled', fullPage: true });
});

test('email draft details remain visible and require one explicit confirmation', async ({ context, page }, info) => {
  await context.addCookies([{ name: 'restore_access', value: 'portfolio-fixture', domain: '127.0.0.1', path: '/' }]);
  const stamp = '2026-11-06T09:00:00Z';
  const chat = { id: 'email-chat', user_id: 'portfolio-demo', title: 'Email review', created_at: stamp, updated_at: stamp };
  let action = { id: 'email-action', chat_id: chat.id, turn_id: 'turn', kind: 'send_email', status: 'pending', result_id: null as string | null, expires_at: '2099-01-01T00:00:00Z', resolved_at: null, created_at: stamp, payload: { to: ['recipient@example.test'], subject: 'Review this draft', body: 'Literal <img src=x onerror=alert(1)> text', account_id: null } };
  let mutations = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') {
      mutations++;
      action = { ...action, status: 'executed', result_id: 'sent-fixture' };
      return route.fulfill({ json: action });
    }
    const body = path === '/api/auth/session' ? { user: { id: 'portfolio-demo', email: 'demo@example.test', full_name: 'Demo', role: 'employee', manager_id: null, timezone: 'Europe/Moscow', is_active: true } } : path === '/api/chats' ? [chat] : path === '/api/chats/email-chat' ? chat : path.endsWith('/actions') ? [action] : path.endsWith('/messages') ? { items: [], next_before_sequence: null } : path.endsWith('/unread-count') ? { count: 0 } : [];
    return route.fulfill({ json: body });
  });
  await page.goto('/workspace?chat=email-chat');
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Отправить письмо', exact: true }) });
  await expect(card.getByText('recipient@example.test', { exact: true })).toBeVisible();
  await expect(card.getByText('Review this draft', { exact: true })).toBeVisible();
  await expect(card.getByText(action.payload.body, { exact: true })).toBeVisible();
  await expect(card.locator('img')).toHaveCount(0);
  expect(mutations).toBe(0);
  await page.screenshot({ path: await evidencePath(`email-review-${info.project.name}`), animations: 'disabled', fullPage: true });
  await card.getByRole('button', { name: 'Отправить письмо', exact: true }).click();
  await expect(card.getByText('Действие выполнено и сохранено.')).toBeVisible();
  expect(mutations).toBe(1);
  expect(errors).toEqual([]);
});
