import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { importN8nWorkflow } from '@/lib/server/n8n';
import { audit } from '@/lib/server/audit';

const MAX_WORKFLOW_SIZE = 2 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const ctx = await requirePermission('automations.manage');
    await requireFeature(ctx, 'automacoes');

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'workflow_file_required' }, { status: 400 });
    }
    if (!file.size || file.size > MAX_WORKFLOW_SIZE) {
      return NextResponse.json({ error: 'workflow_file_too_large' }, { status: 400 });
    }

    let workflow: unknown;
    try {
      workflow = JSON.parse(await file.text());
    } catch {
      return NextResponse.json({ error: 'invalid_workflow_json' }, { status: 400 });
    }

    const data = await importN8nWorkflow(ctx.tenantId, workflow as Record<string, unknown>, ctx.userId);

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'n8n.workflow.import',
      entity: 'n8n_workflow',
      entityId: data.id ?? undefined,
      metadata: { name: data.name, active: data.active, version: data.version }
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : '';
    if (message === 'n8n_api_not_configured') {
      return NextResponse.json({ error: 'n8n_api_not_configured' }, { status: 503 });
    }
    if (message === 'workflow_nodes_required' || message === 'workflow_connections_required') {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'n8n_workflow_import_failed', detail: message.slice(0, 240) }, { status: 502 });
  }
}
