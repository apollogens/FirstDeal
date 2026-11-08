import {NextResponse} from 'next/server';
import {checkOrigin,clearSession,errorResponse} from '@/lib/auth-server';
export async function POST(request:Request){try{checkOrigin(request);await clearSession();return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
