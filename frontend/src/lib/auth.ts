import { isRecord, readAuthUser, readErrorFields } from './auth-validation';
export type LoginCredentials={email:string;password:string;remember:boolean};
export type RegistrationCredentials={name:string;email:string;password:string};
export class AuthApiError extends Error {constructor(public status:number,message:string,public fields:Record<string,string>={}){super(message)}}
async function request<T>(path:string,parse:(value:unknown)=>T,body?:unknown,signal?:AbortSignal):Promise<T>{
  const response=await fetch(`/api/auth/${path}`,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal});
  const data: unknown = await response.json().catch(()=>null);
  if(!response.ok)throw new AuthApiError(response.status,isRecord(data)&&typeof data.message==='string'?data.message:'\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u0437\u0430\u043f\u0440\u043e\u0441.',isRecord(data)?readErrorFields(data.fields):{});
  return parse(data);
}
const userResponse=(value:unknown)=>{if(!isRecord(value))throw new AuthApiError(502,'\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0435\u0440\u043d\u0443\u043b \u043d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f.');const user=readAuthUser(value.user);if(!user)throw new AuthApiError(502,'\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0435\u0440\u043d\u0443\u043b \u043d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f.');return {user};};
export const signIn=(values:LoginCredentials)=>request('login',userResponse,values);
export const signUp=(values:RegistrationCredentials)=>request('register',userResponse,values);
export const getSession=(signal?:AbortSignal)=>request('session',userResponse,undefined,signal);
export const signOut=()=>request('logout',(value)=>{if(!isRecord(value)||typeof value.ok!=='boolean')throw new AuthApiError(502,'\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0435\u0440\u043d\u0443\u043b \u043d\u0435\u043a\u043e\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043e\u0442\u0432\u0435\u0442.');return {ok:value.ok};},{});
export function safeReturnPath(value:string|null){
  if(!value||value.includes('\\')||/[\u0000-\u0020]/.test(value))return '/workspace';
  try{const u=new URL(value,'http://restore.local');return u.origin==='http://restore.local'&&(u.pathname==='/workspace'||u.pathname.startsWith('/workspace/')||u.pathname==='/profile')?u.pathname+u.search+u.hash:'/workspace'}catch{return '/workspace'}
}
