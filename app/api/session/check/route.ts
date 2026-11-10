import {NextResponse} from 'next/server';
import {getRequestContext} from '@/lib/auth/context';

export const dynamic='force-dynamic';

export async function GET(){
  try{
    await getRequestContext();
    return NextResponse.json({active:true},{headers:{'cache-control':'no-store'}});
  }catch(error){
    if(error instanceof Response)return NextResponse.json({active:false},{status:error.status,headers:{'cache-control':'no-store'}});
    return NextResponse.json({error:'session_check_failed'},{status:503,headers:{'cache-control':'no-store'}});
  }
}
