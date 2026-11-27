import { NextResponse } from 'next/server';
import { canViewTeamAttendance } from '@/lib/attendance-access';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const ctx = await requirePermission('conversations.view');
    await requireFeature(ctx, 'atendimento');
    const supabase = await createClient();
    const cutoff = Date.now() - 10 * 60 * 1000;
    const pageSize = 200;
    const pending = [];

    for (let offset = 0; ; offset += pageSize) {
      let query = supabase.from('conversations')
        .select('id,channel,contact:contacts(id,name,phone),assignee:profiles!conversations_assigned_to_fkey(full_name),messages(direction,body,message_type,attachment_name,created_at)')
        .eq('tenant_id', ctx.tenantId)
        .neq('status', 'closed')
        .in('messages.direction', ['inbound', 'outbound'])
        .order('created_at', { referencedTable: 'messages', ascending: false })
        .order('id', { referencedTable: 'messages', ascending: false })
        .limit(1, { referencedTable: 'messages' })
        .order('id')
        .range(offset, offset + pageSize - 1);
      if (!canViewTeamAttendance(ctx.role)) {
        query = query.or(`assigned_to.eq.${ctx.userId},and(assigned_to.is.null,attendance_state.in.(waiting,automatic))`);
      }
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
    return NextResponse.json({ data: pending, tenantId: ctx.tenantId });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'follow_up_fetch_failed' }, { status: 500 });
  }
}
