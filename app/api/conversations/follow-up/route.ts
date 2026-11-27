import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canViewTeamAttendance } from '@/lib/attendance-access';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { createAdminClient } from '@/lib/supabase/admin';
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
        .eq('attendance_state', 'in_service')
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

    // Attendance permissions can differ from deal permissions. Check only contacts
    // already visible to this operator and return no deal data to the browser.
    const contactIds = [...new Set(pending.flatMap(row => row.contact?.id ? [row.contact.id] : []))];
    const excluded = new Set<string>();
    if (contactIds.length) {
      const admin = createAdminClient();
      for (let start = 0; start < contactIds.length; start += 100) {
        const { data, error } = await admin.from('deals').select('contact_id')
          .eq('tenant_id', ctx.tenantId)
          .in('contact_id', contactIds.slice(start, start + 100))
          .in('stage', ['won', 'lost']);
        if (error) throw error;
        for (const deal of data ?? []) excluded.add(deal.contact_id);
      }
    }
    const eligible = pending.filter(row => !row.contact?.id || !excluded.has(row.contact.id));
    eligible.sort((a, b) => Date.parse(a.last.created_at) - Date.parse(b.last.created_at));
    return NextResponse.json({ data: eligible, tenantId: ctx.tenantId, canViewTeam, attendants }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'follow_up_fetch_failed' }, { status: 500 });
  }
}
