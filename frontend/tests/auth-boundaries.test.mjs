import test from 'node:test';
import assert from 'node:assert/strict';
import { readAuthUser, readAuthTokens, readCredentialInput, readErrorFields, readIssueFieldNames } from '../src/lib/auth-validation.ts';

const user = { id: 'u1', email: 'a@example.com', full_name: 'A', role: 'employee', manager_id: null, timezone: 'UTC', is_active: true };

test('auth user requires backend schema fields, including nullable manager_id', () => {
  assert.deepEqual(readAuthUser(user), user);
  for (const patch of [{ manager_id: undefined }, { timezone: undefined }, { role: 'owner' }, { is_active: 'true' }])
    assert.equal(readAuthUser({ ...user, ...patch }), null);
});

test('tokens are validated and projected', () => {
  assert.deepEqual(readAuthTokens({ access_token: 'a', refresh_token: 'r', token_type: 'bearer', extra: true }), { access_token: 'a', refresh_token: 'r', token_type: 'bearer' });
  assert.equal(readAuthTokens({ access_token: 'a', refresh_token: '', token_type: 'bearer' }), null);
});

test('credentials accept only object input and preserve optional registration name', () => {
  assert.deepEqual(readCredentialInput({ email: 'a@b.co', password: '12345678', remember: true }, false), { email: 'a@b.co', password: '12345678', remember: true });
  assert.equal(readCredentialInput(null, false), null);
  assert.equal(readCredentialInput({ email: 'a@b.co', password: '12345678' }, true), null);
});

test('error fields retain only string field messages', () => {
  assert.deepEqual(readErrorFields({ email: 'bad', password: 3, name: 'short', unexpected: 'x' }), { email: 'bad', name: 'short' });
  assert.deepEqual(readErrorFields({ email: ['nested'], password: { message: 'bad' }, name: null }), {});
  assert.deepEqual(readErrorFields(null), {});
});

test('backend validation issues ignore malformed entries and locations', () => {
  assert.deepEqual(readIssueFieldNames([
    { loc: ['body', 'email'] }, null, [], { loc: 'password' }, { loc: ['body', 7] }, { loc: [] },
    { loc: ['body', 'password'], msg: 'invalid' },
  ]), ['email', 'password']);
  assert.deepEqual(readIssueFieldNames({ detail: [{ loc: ['body', 'email'] }] }), []);
});
