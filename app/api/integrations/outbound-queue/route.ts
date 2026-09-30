import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { processOutboundQueue } from '@/lib/server/outbound-queue';

export async function GET() {
  try {
    const ctx = await requirePermission('conversations.manage');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('outbound_message_queue')
      .select('id,conversation_id,message_id,channel,status,attempts,max_attempts,next_attempt_at,last_error,created_at,completed_at')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'queue_fetch_failed' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const ctx = await requirePermission('conversations.manage');
    const data = await processOutboundQueue(25, ctx.tenantId);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'queue_process_failed' }, { status: 500 });
  }
}
