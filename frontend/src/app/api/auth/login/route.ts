import { NextResponse } from 'next/server';
import { credentials,errorResponse,login } from '@/lib/auth-server';
export async function POST(request:Request){try{const v=await credentials(request);const user=await login(v.email,v.password,v.remember);return NextResponse.json({user},{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
