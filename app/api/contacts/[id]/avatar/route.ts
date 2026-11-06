import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { getEvolutionContactPicture } from '@/lib/server/evolution';

const cache = new Map<string, { expires: number; url: string | null }>();
export function safeContactPicture(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port==='443') &&
      ['whatsapp.net', 'fbcdn.net'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url.href : null;
  } catch { return null; }
}
export async function GET(_request: Request, { params }: { params: Promise<{id:string}> }) {
  try {
    const ctx = await requirePermission('conversations.view');
    const {id} = await params;
    if (!z.string().uuid().safeParse(id).success) return new Response(null,{status:404});
    const db = await createClient();
    const {data:contact,error} = await db.from('contacts').select('phone').eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
    if (error || !contact?.phone) return new Response(null,{status:404});
    const key = `${ctx.tenantId}:${id}:${contact.phone}`;
    let entry=cache.get(key);
    if (!entry || entry.expires<Date.now()) {
      const url=safeContactPicture(await getEvolutionContactPicture(ctx.tenantId,contact.phone).catch(()=>null));
      entry={url,expires:Date.now()+(url?300000:60000)};
      if(cache.size>=500)cache.delete(cache.keys().next().value!);
      cache.set(key,entry);
    }
    const headers={'cache-control':'private, no-store',vary:'Cookie'};
    return entry.url ? new Response(null,{status:307,headers:{...headers,location:entry.url}}) : new Response(null,{status:404,headers});
  }catch(e){if(e instanceof Response)return e;return new Response(null,{status:404,headers:{'cache-control':'private, no-store'}});}
}
