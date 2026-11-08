import type { AuthUser } from './auth-types';

export type AuthTokens = { access_token: string; refresh_token: string; token_type: 'bearer' };
export type CredentialInput = { email: string; password: string; name?: string; remember: boolean };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readAuthUser(value: unknown): AuthUser | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.email !== 'string' ||
      typeof value.full_name !== 'string' || !(value.role === 'employee' || value.role === 'manager' || value.role === 'admin') ||
      typeof value.is_active !== 'boolean' || typeof value.timezone !== 'string' ||
      !(typeof value.manager_id === 'string' || value.manager_id === null)) return null;
  return { id: value.id, email: value.email, full_name: value.full_name,
    role: value.role, manager_id: value.manager_id,
    timezone: value.timezone, is_active: value.is_active };
}

export function readAuthTokens(value: unknown): AuthTokens | null {
  if (!isRecord(value) || typeof value.access_token !== 'string' || !value.access_token ||
      typeof value.refresh_token !== 'string' || !value.refresh_token || value.token_type !== 'bearer') return null;
  return { access_token: value.access_token, refresh_token: value.refresh_token, token_type: 'bearer' };
}

export function readCredentialInput(value: unknown, register: boolean): CredentialInput | null {
  if (!isRecord(value) || typeof value.email !== 'string' || typeof value.password !== 'string') return null;
  const name = value.name;
  if (register && typeof name !== 'string') return null;
  return { email: value.email, password: value.password,
    ...(register && typeof name === 'string' ? { name } : {}), remember: value.remember === true };
}

export function readErrorFields(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const fields: Record<string, string> = {};
  for (const key of ['email', 'password', 'name'] as const) {
    if (typeof value[key] === 'string') fields[key] = value[key];
  }
  return fields;
}

export function readIssueFieldNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const issue of value) {
    if (!isRecord(issue) || !Array.isArray(issue.loc)) continue;
    const field: unknown = issue.loc.at(-1);
    if (typeof field === 'string') names.push(field);
  }
  return names;
}
