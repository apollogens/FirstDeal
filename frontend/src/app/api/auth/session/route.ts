import {NextResponse} from 'next/server';
import {session,saveSession,errorResponse,AuthError} from '@/lib/auth-server';
export async function GET(request:Request){try{if(request.headers.get('sec-fetch-site')==='cross-site')throw new AuthError(403,'Запрос с другого сайта запрещён.');const v=await session();if(v.tokens)await saveSession(v.tokens,v.remember);return NextResponse.json({user:v.user},{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e,true)}}
