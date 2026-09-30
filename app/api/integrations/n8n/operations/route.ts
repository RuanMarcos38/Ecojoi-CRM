import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { importN8nWorkflow } from '@/lib/server/n8n';

const restoreSchema = z.object({ version_id: z.string().uuid() });

export async function GET() {
  try {
    const ctx = await requirePermission('automations.view');
    const supabase = await createClient();
    const [versions, logs] = await Promise.all([
      supabase
        .from('n8n_workflow_versions')
        .select('id,workflow_id,workflow_name,version_number,created_at')
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('n8n_execution_logs')
        .select('id,workflow_id,conversation_id,event_type,status,duration_ms,error,created_at')
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: false })
        .limit(50)
    ]);
    if (versions.error || logs.error) throw versions.error ?? logs.error;
    return NextResponse.json({ data: { versions: versions.data ?? [], logs: logs.data ?? [] } });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'n8n_operations_fetch_failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePermission('automations.manage');
    const input = restoreSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: version, error } = await supabase
      .from('n8n_workflow_versions')
      .select('workflow_json')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', input.version_id)
      .maybeSingle();
    if (error) throw error;
    if (!version) return NextResponse.json({ error: 'version_not_found' }, { status: 404 });

    const data = await importN8nWorkflow(ctx.tenantId, version.workflow_json as Record<string, unknown>, ctx.userId);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'n8n_restore_failed' }, { status: 500 });
  }
}
