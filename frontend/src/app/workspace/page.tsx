import {redirect} from 'next/navigation';
import {session,AuthError} from '@/lib/auth-server';
import {SessionWorkspace} from '@/components/auth/SessionWorkspace';
import type {WorkspaceSection} from '@/components/Sidebar';
const sections = new Set<WorkspaceSection>(['giga','mail','calendar','documents','finance','memory','history','settings']);
export default async function WorkspacePage({searchParams}:{searchParams:Promise<{section?:string;chat?:string}>}){
  const params=await searchParams;
  const requested=params.section as WorkspaceSection|undefined;
  const initialSection=requested&&sections.has(requested)?requested:'giga';
  let current;try{current=await session()}catch(e){if(e instanceof AuthError&&e.status===401)redirect('/login?next=%2Fworkspace');return <SessionWorkspace unavailable/>}
  return <SessionWorkspace initialUser={current.user} initialSection={initialSection} initialChatId={typeof params.chat==='string'?params.chat:''}/>;
}
