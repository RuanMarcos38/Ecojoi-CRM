import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { createClient } from '@/lib/supabase/server';
import { canViewTeamAttendance } from '@/lib/attendance-access';

export async function GET() {
  try {
    const ctx = await requirePermission('conversations.view');
    await requireFeature(ctx, 'atendimento');
    const db = await createClient();
    const now = Date.now();
    const cutoff = now - 10 * 60 * 1000;
    const cards = [];
    const pageSize = 100;
    let cursor: string | undefined;

    for (;;) {
      let query = db.from('conversations')
        .select('id,channel,contact:contacts(name),assignee:profiles!conversations_assigned_to_fkey(full_name),messages(direction,created_at)')
        .eq('tenant_id', ctx.tenantId)
        .neq('status', 'closed')
        .lte('last_inbound_at', new Date(cutoff).toISOString())
        .in('messages.direction', ['inbound', 'outbound'])
        .order('created_at', { referencedTable: 'messages', ascending: false })
        .limit(1, { referencedTable: 'messages' })
        .order('id').limit(pageSize);
      if (!canViewTeamAttendance(ctx.role)) {
        query = query.or(`assigned_to.eq.${ctx.userId},and(assigned_to.is.null,attendance_state.in.(waiting,automatic))`);
      }
      if (cursor) query = query.gt('id', cursor);
      const { data, error } = await query;
      if (error) throw error;

      for (const conversation of data ?? []) {
        const last = conversation.messages?.[0];
        const receivedAt = Date.parse(last?.created_at ?? '');
        if (last?.direction !== 'inbound' || !Number.isFinite(receivedAt) || receivedAt > cutoff) continue;
        const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
        const assignee = Array.isArray(conversation.assignee) ? conversation.assignee[0] : conversation.assignee;
        cards.push({
          id: conversation.id,
          channel: conversation.channel,
          name: contact?.name ?? 'Contato',
          assignee: assignee?.full_name ?? null,
          receivedAt,
          waitingMinutes: Math.floor((now - receivedAt) / 60000)
        });
      }
      if (!data || data.length < pageSize) break;
      cursor = data[data.length - 1].id;
    }

    return NextResponse.json({ data: cards.sort((a, b) => a.receivedAt - b.receivedAt) });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'follow_up_fetch_failed' }, { status: 500 });
  }
}
