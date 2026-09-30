import { NextResponse } from 'next/server';
import { runOperationalWorkers } from '@/lib/server/worker';

export const runtime='nodejs';

export async function POST(req:Request){
  const expected=process.env.WORKER_SECRET?.trim();
  if(!expected)return NextResponse.json({error:'worker_not_configured'},{status:503});
  if(req.headers.get('authorization')!==`Bearer ${expected}`)return NextResponse.json({error:'unauthorized'},{status:401});
  try{
    const data=await runOperationalWorkers();
    return NextResponse.json({data});
  }catch{
    return NextResponse.json({error:'worker_failed'},{status:500});
  }
}
