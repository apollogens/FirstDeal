'use client';
import {useEffect,useState,useRef} from 'react';
import {AppShell} from '@/components/AppShell';
import type {AuthUser} from '@/lib/auth-types';
import {AuthApiError,getSession,signOut} from '@/lib/auth';
import s from './Auth.module.css';
import type {WorkspaceSection} from '@/components/Sidebar';
import type {ProfileTab} from '@/components/ProfileScreen';
export function SessionWorkspace({initialUser,unavailable=false,initialSection='giga',initialProfileTab='profile',initialChatId=''}:{initialUser?:AuthUser;unavailable?:boolean;initialSection?:WorkspaceSection;initialProfileTab?:ProfileTab;initialChatId?:string}){
 const [user,setUser]=useState(initialUser);const [message,setMessage]=useState(unavailable?'Сервис авторизации недоступен. Попробуйте ещё раз.':'');const [leaving,setLeaving]=useState(false);const busy=useRef(false);const loggingOut=useRef(false);
 useEffect(()=>{const controller=new AbortController();async function check(){if(busy.current||loggingOut.current||document.hidden)return;busy.current=true;try{const result=await getSession(controller.signal);if(!loggingOut.current){setUser(result.user);setMessage('')}}catch(e){if(controller.signal.aborted)return;if(e instanceof AuthApiError&&(e.status===401||e.status===403)){setUser(undefined);const next=window.location.pathname+window.location.search;window.location.replace(`/login?next=${encodeURIComponent(next)}`)}else setMessage('Не удалось проверить сессию. Повторим при восстановлении связи.')}finally{busy.current=false}}const checkSession=()=>{void check()};checkSession();const timer=setInterval(checkSession,60000);window.addEventListener('focus',checkSession);document.addEventListener('visibilitychange',checkSession);return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',checkSession);document.removeEventListener('visibilitychange',checkSession)}},[]);
 async function logout(){if(loggingOut.current)return;loggingOut.current=true;setLeaving(true);try{await signOut();setUser(undefined);window.location.replace('/login')}catch{setMessage('Не удалось выйти. Попробуйте ещё раз.');loggingOut.current=false;setLeaving(false)}}
 if(!user)return <main className={s.auth}><section className={s.auth__card}><h1>Подключение к аккаунту</h1><p role="status" className={s.auth__formMessage}>{message||'Проверяем сессию…'}</p><button className={s.auth__submit} onClick={()=>window.location.reload()}>Повторить</button><a className={s.auth__textButton} href="/login">Вернуться ко входу</a></section></main>;
 return <>{message&&<div className={s.auth__sessionStatus} role="status">{message}</div>}<AppShell user={user} onLogout={()=>{void logout()}} loggingOut={leaving} initialSection={initialSection} initialProfileTab={initialProfileTab} initialChatId={initialChatId}/></>;
}
