import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { AuthUser } from './auth-types';
import { isRecord, readAuthTokens, readAuthUser, readCredentialInput, readIssueFieldNames } from './auth-validation';

export class AuthError extends Error {
  constructor(public status: number, message: string, public fields: Record<string,string> = {}) { super(message); }
}
type Tokens = { access_token: string; refresh_token: string; token_type: 'bearer' };
type Session = { user: AuthUser; tokens?: Tokens; remember: boolean };
const names = { access: 'restore_access', refresh: 'restore_refresh', remember: 'restore_remember' };
const translations: Record<string,string> = {
  'Incorrect email or password': 'Неверная почта или пароль.',
  'User with this email already exists': 'Аккаунт с этой почтой уже существует.',
  'User not found or inactive': 'Аккаунт недоступен или отключён.',
  'Not enough permissions': 'Недостаточно прав для этого действия.',
};
export async function backend(path: string, method = 'GET', body?: unknown, token?: string): Promise<unknown> {
  const base = process.env.AUTH_API_URL;
  if (!base) throw new AuthError(503, 'Адрес сервиса авторизации не настроен.');
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/,'')}/api/v1/auth${path}`, {
      method, headers: { Accept:'application/json', ...(body ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {}) },
      ...(body ? {body:JSON.stringify(body)} : {}), cache:'no-store', redirect:'error', signal:AbortSignal.timeout(8000),
    });
  } catch { throw new AuthError(503, 'Сервис авторизации недоступен. Попробуйте ещё раз.'); }
  const data: unknown = await response.json().catch(()=>null);
  if (!response.ok) {
    const fields: Record<string,string> = {};
    const detail = isRecord(data) ? data.detail : undefined;
    if (response.status === 422) {
      for (const field of readIssueFieldNames(detail)) {
        if (['email','password','full_name'].includes(field)) fields[field === 'full_name' ? 'name' : field] = field === 'email' ? '\u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 \u044d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u043e\u0439 \u043f\u043e\u0447\u0442\u044b.' : field === 'password' ? '\u041f\u0430\u0440\u043e\u043b\u044c \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u043e\u0434\u0435\u0440\u0436\u0430\u0442\u044c \u043e\u0442 8 \u0434\u043e 128 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432.' : '\u0418\u043c\u044f \u0434\u043e\u043b\u0436\u043d\u043e \u0441\u043e\u0434\u0435\u0440\u0436\u0430\u0442\u044c \u043e\u0442 2 \u0434\u043e 255 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432.';
      }
    }
    if (response.status === 409) fields.email = '\u0410\u043a\u043a\u0430\u0443\u043d\u0442 \u0441 \u044d\u0442\u043e\u0439 \u043f\u043e\u0447\u0442\u043e\u0439 \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442.';
    const message = typeof detail === 'string' ? translations[detail] : undefined;
    throw new AuthError(response.status >= 500 ? 502 : response.status, message || (response.status === 401 ? 'Сессия истекла. Войдите снова.' : response.status === 422 ? 'Проверьте заполнение полей.' : 'Не удалось выполнить запрос. Попробуйте ещё раз.'), fields);
  }
  return data;
}
export function readUser(value: unknown): AuthUser {
  const user = readAuthUser(value);
  if (!user) throw new AuthError(502,'\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0435\u0440\u043d\u0443\u043b \u043d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f.');
  if (!user.is_active) throw new AuthError(401,'\u0410\u043a\u043a\u0430\u0443\u043d\u0442 \u043e\u0442\u043a\u043b\u044e\u0447\u0451\u043d.');
  return user;
}
function readTokens(value: unknown): Tokens {
  const tokens = readAuthTokens(value);
  if (!tokens) throw new AuthError(502,'\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0435\u0440\u043d\u0443\u043b \u043d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u0443\u044e \u0441\u0435\u0441\u0441\u0438\u044e.');
  return tokens;
}
// Decode only to align cookie lifetime, never to authorize a user. /me validates JWTs.
function lifetime(token:string, fallback:number) {
  try { const payload: unknown = JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()); if (isRecord(payload) && typeof payload.exp === 'number' && Number.isFinite(payload.exp)) return Math.max(0,Math.floor(payload.exp-Date.now()/1000)); } catch {}
  return fallback;
}
export async function saveSession(tokens:Tokens,remember:boolean) {
  const jar=await cookies();
  const options={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',priority:'high' as const};
  jar.set(names.access,tokens.access_token,{...options,...(remember?{maxAge:lifetime(tokens.access_token,900)}:{})});
  jar.set(names.refresh,tokens.refresh_token,{...options,...(remember?{maxAge:lifetime(tokens.refresh_token,604800)}:{})});
  jar.set(names.remember,remember?'1':'0',{...options,...(remember?{maxAge:lifetime(tokens.refresh_token,604800)}:{})});
}
export async function clearSession(){const jar=await cookies();for(const name of Object.values(names))jar.set(name,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});}
export function checkOrigin(request:Request) {
  const allowed=(process.env.AUTH_APP_ORIGINS || process.env.AUTH_APP_ORIGIN || new URL(request.url).origin).split(',').map(origin=>origin.trim()).filter(Boolean);
  const origin=request.headers.get('origin');
  if (!origin || !allowed.includes(origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new AuthError(403,'Запрос с другого сайта запрещён.');
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AuthError(415,'Ожидается JSON.');
}
export async function credentials(request:Request,register=false) {
  checkOrigin(request);
  const raw=await request.text();if(raw.length>16384)throw new AuthError(413,'Запрос слишком большой.');
  let parsed: unknown;try{parsed=JSON.parse(raw)}catch{throw new AuthError(400,'Некорректный запрос.')}
  const v = readCredentialInput(parsed, register);
  const fields:Record<string,string>={};
  if(!v||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()))fields.email='Введите корректную электронную почту.';
  if(!v||v.password.length<8||v.password.length>128)fields.password='Пароль должен содержать от 8 до 128 символов.';
  if(register&&(!v||!v.name||v.name.trim().length<2||v.name.trim().length>255))fields.name='Имя должно содержать от 2 до 255 символов.';
  if(Object.keys(fields).length)throw new AuthError(422,'Проверьте заполнение полей.',fields);
  if (!v) throw new AuthError(422,'\u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435 \u043f\u043e\u043b\u0435\u0439.',fields);
  return {email:v.email.trim(),password:v.password,full_name:register?v.name?.trim():undefined,remember:v.remember};
}
export async function login(email:string,password:string,remember:boolean){
  const tokens=readTokens(await backend('/login','POST',{email,password}));
  const user=readUser(await backend('/me','GET',undefined,tokens.access_token));
  await saveSession(tokens,remember);return user;
}
// Collapse concurrent refreshes in this Next.js instance, including SSR + hydration.
// Brief grace cache accommodates parallel requests carrying the previous cookie.
const flights=new Map<string,Promise<Tokens>>();
async function refresh(token:string){
  const key=createHash('sha256').update(token).digest('hex');
  let pending=flights.get(key);
  if(!pending){pending=backend('/refresh','POST',{refresh_token:token}).then(readTokens);flights.set(key,pending);void pending.then(()=>{setTimeout(()=>flights.delete(key),5000).unref()},()=>{flights.delete(key);});}
  return pending;
}
export async function session():Promise<Session>{
  const jar=await cookies();const access=jar.get(names.access)?.value;const token=jar.get(names.refresh)?.value;const remember=jar.get(names.remember)?.value==='1';
  if(access){try{return {user:readUser(await backend('/me','GET',undefined,access)),remember}}catch(error){if(!(error instanceof AuthError)||error.status!==401)throw error;}}
  if(!token)throw new AuthError(401,'Войдите в аккаунт.');
  const tokens=await refresh(token);const user=readUser(await backend('/me','GET',undefined,tokens.access_token));return {user,tokens,remember};
}
export async function bearerSession():Promise<{token:string;tokens?:Tokens;remember:boolean}>{
  const jar=await cookies();const access=jar.get(names.access)?.value;const token=jar.get(names.refresh)?.value;const remember=jar.get(names.remember)?.value==='1';
  if(access){try{readUser(await backend('/me','GET',undefined,access));return {token:access,remember}}catch(error){if(!(error instanceof AuthError)||error.status!==401)throw error;}}
  if(!token)throw new AuthError(401,'Войдите в аккаунт.');
  const tokens=await refresh(token);readUser(await backend('/me','GET',undefined,tokens.access_token));return {token:tokens.access_token,tokens,remember};
}
export async function errorResponse(error:unknown,clear=false){
  const e=error instanceof AuthError?error:new AuthError(500,'Не удалось выполнить запрос.');
  if(clear&&e.status===401)await clearSession();
  return NextResponse.json({message:e.message,fields:e.fields},{status:e.status,headers:{'Cache-Control':'no-store'}});
}
