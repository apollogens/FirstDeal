import { NextResponse } from 'next/server';
import { backend,credentials,errorResponse,readUser } from '@/lib/auth-server';
export async function POST(request:Request){try{const v=await credentials(request,true);const user=readUser(await backend('/register','POST',{email:v.email,password:v.password,full_name:v.full_name}));return NextResponse.json({user},{status:201,headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
