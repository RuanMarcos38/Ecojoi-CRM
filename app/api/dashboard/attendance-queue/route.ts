import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const ctx = await requirePermission('conversations.view');
    await requireFeature(ctx, 'atendimento');
    const supabase = await createClient();
    const count = (state: string) => supabase.from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId).in('status', ['open', 'pending']).eq('attendance_state', state);

    const [waiting, human, automatic, oldest] = await Promise.all([
      count('waiting'),
      count('in_service'),
      count('automatic'),
      supabase.from('conversations')
        .select('id,channel,created_at,attendance_changed_at,contact:contacts(name)')
        .eq('tenant_id', ctx.tenantId).in('status', ['open', 'pending']).eq('attendance_state', 'waiting')
        .order('attendance_changed_at', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: true }).order('id').limit(5)
    ]);
    if (waiting.error || human.error || automatic.error || oldest.error) {
      return NextResponse.json({ error: 'attendance_queue_fetch_failed' }, { status: 500 });
    }

    return NextResponse.json({
      tenantId: ctx.tenantId,
      waiting: waiting.count ?? 0,
      human: human.count ?? 0,
      automatic: automatic.count ?? 0,
      updatedAt: new Date().toISOString(),
      oldest: (oldest.data ?? []).map(row => {
        const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact;
        return { id: row.id, name: contact?.name ?? 'Contato', since: row.attendance_changed_at ?? row.created_at };
      })
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'attendance_queue_fetch_failed' }, { status: 500 });
  }
}
