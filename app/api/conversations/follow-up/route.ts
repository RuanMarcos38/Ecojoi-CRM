import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canViewTeamAttendance } from '@/lib/attendance-access';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const ctx = await requirePermission('conversations.view');
    await requireFeature(ctx, 'atendimento');
    const scope = new URL(request.url).searchParams.get('scope') ?? 'mine';
    const canViewTeam = canViewTeamAttendance(ctx.role);
    if (scope !== 'mine' && !canViewTeam) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (!['mine', 'all', 'unassigned'].includes(scope) && !z.string().uuid().safeParse(scope).success) {
      return NextResponse.json({ error: 'invalid_scope' }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: attendants, error: attendantsError } = canViewTeam
      ? await supabase.from('profiles').select('id,full_name').eq('tenant_id', ctx.tenantId)
        .is('deleted_at', null).neq('id', ctx.userId).order('full_name')
      : { data: [], error: null };
    if (attendantsError) throw attendantsError;
    const cutoff = Date.now() - 10 * 60 * 1000;
    const pageSize = 200;
    const pending = [];

    for (let offset = 0; ; offset += pageSize) {
      let query = supabase.from('conversations')
        .select('id,channel,contact:contacts(id,name,phone),assignee:profiles!conversations_assigned_to_fkey(full_name),messages(id,direction,body,message_type,attachment_name,created_at)')
        .eq('tenant_id', ctx.tenantId)
        .neq('status', 'closed')
        .or('direction.eq.inbound,and(direction.eq.outbound,status.in.(sent,delivered,read))', { referencedTable: 'messages' })
        .order('created_at', { referencedTable: 'messages', ascending: false })
        .order('id', { referencedTable: 'messages', ascending: false })
        .limit(1, { referencedTable: 'messages' })
        .order('id')
        .range(offset, offset + pageSize - 1);
      if (scope === 'unassigned') query = query.is('assigned_to', null);
      else if (scope !== 'all') query = query.eq('assigned_to', scope === 'mine' ? ctx.userId : scope);
      const { data, error } = await query;
      if (error) throw error;
      for (const { messages, ...conversation } of data) {
        const last = messages?.[0];
        if (last?.direction === 'inbound' && Date.parse(last.created_at) < cutoff) {
          pending.push({ ...conversation, last });
        }
      }
      if (data.length < pageSize) break;
    }

    pending.sort((a, b) => Date.parse(a.last.created_at) - Date.parse(b.last.created_at));
    return NextResponse.json({ data: pending, tenantId: ctx.tenantId, canViewTeam, attendants }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'follow_up_fetch_failed' }, { status: 500 });
  }
}
