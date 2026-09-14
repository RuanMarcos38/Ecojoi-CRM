import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
export async function GET(){try{return NextResponse.json({data:await getRequestContext()})}catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'internal_error'},{status:500})}}
