import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantMetaStatus } from '@/lib/server/meta';
import { getN8nStatus } from '@/lib/server/n8n';

export async function GET() {
  try {
    const ctx = await requirePermission('settings.view');
    const admin = createAdminClient();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [
      meta,
      n8n,
      events,
      queuePending,
      queueDead,
      sla,
      n8nFailed
    ] = await Promise.all([
      getTenantMetaStatus(ctx.tenantId),
      getN8nStatus(ctx.tenantId),
      admin.from('integration_events').select('id,provider,event_type,received_at').eq('tenant_id',ctx.tenantId).gte('received_at',dayAgo).order('received_at',{ascending:false}).limit(20),
      admin.from('outbound_message_queue').select('id',{count:'exact',head:true}).eq('tenant_id',ctx.tenantId).in('status',['pending','failed']),
      admin.from('outbound_message_queue').select('id',{count:'exact',head:true}).eq('tenant_id',ctx.tenantId).eq('status','dead_letter'),
      admin.from('conversations').select('id',{count:'exact',head:true}).eq('tenant_id',ctx.tenantId).neq('status','closed').not('sla_due_at','is',null).lte('sla_due_at',now.toISOString()).is('first_response_at',null),
      admin.from('n8n_execution_logs').select('id',{count:'exact',head:true}).eq('tenant_id',ctx.tenantId).eq('status','failed').gte('created_at',dayAgo)
    ]);

    const latestEvent = events.data?.[0] ?? null;

    return NextResponse.json({
      data: {
        meta: {
          ok: meta.runtimeConfigured && meta.identifiersConfigured,
          runtimeConfigured: meta.runtimeConfigured,
          identifiersConfigured: meta.identifiersConfigured
        },
        n8n: {
          ok: n8n.importConfigured && n8n.webhookConfigured,
          ...n8n
        },
        queue: {
          pending: queuePending.count ?? 0,
          deadLetter: queueDead.count ?? 0
        },
        sla: {
          breached: sla.count ?? 0
        },
        n8nExecutions: {
          failed24h: n8nFailed.count ?? 0
        },
        events24h: events.data ?? [],
        latestEvent
      }
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'integration_health_failed' }, { status: 500 });
  }
}
