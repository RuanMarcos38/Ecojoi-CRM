import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { audit } from '@/lib/server/audit';

const schema = z.object({
  title: z.string().min(2).max(180),
  stage: z.enum(['new','qualification','proposal','closing','won','lost']).default('new'),
  value: z.coerce.number().min(0).default(0),
  probability: z.coerce.number().int().min(0).max(100).default(10),
  contact_id: z.string().uuid().optional().nullable(),
  pipeline_id: z.string().uuid().optional().nullable(),
  pipeline_stage_id: z.string().uuid().optional().nullable()
});

export async function GET() {
  try {
    const ctx = await requirePermission('deals.view');
    const supabase = await createClient();
    const { data, error } = await supabase.from('deals')
      .select('id,title,stage,value,probability,contact_id,pipeline_id,pipeline_stage_id,lost_reason_id,closed_at,stage_changed_at,created_at,updated_at,contact:contacts(id,name,phone,email),pipeline:pipelines(id,name),lost_reason:loss_reasons(id,name)')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'deals_fetch_failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('deals.create');
    const body = schema.parse(await req.json());
    const supabase = await createClient();

    if (body.contact_id) {
      const { data: contact } = await supabase.from('contacts').select('id').eq('id', body.contact_id).eq('tenant_id', ctx.tenantId).maybeSingle();
      if (!contact) return NextResponse.json({ error: 'contact_not_found' }, { status: 404 });
    }

    let pipelineId = body.pipeline_id ?? null;
    if (!pipelineId) {
      const { data: pipeline } = await supabase.from('pipelines').select('id').eq('tenant_id',ctx.tenantId).eq('is_default',true).limit(1).maybeSingle();
      pipelineId = pipeline?.id ?? null;
    } else {
      const { data: pipeline } = await supabase.from('pipelines').select('id').eq('tenant_id',ctx.tenantId).eq('id',pipelineId).maybeSingle();
      if(!pipeline) return NextResponse.json({error:'pipeline_not_found'},{status:404});
    }

    let pipelineStageId = body.pipeline_stage_id ?? null;
    if (!pipelineStageId && pipelineId) {
      const { data: pipelineStage } = await supabase.from('pipeline_stages_v2')
        .select('id,probability')
        .eq('tenant_id',ctx.tenantId)
        .eq('pipeline_id',pipelineId)
        .eq('stage_key',body.stage)
        .limit(1)
        .maybeSingle();
      pipelineStageId = pipelineStage?.id ?? null;
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase.from('deals').insert({
      title: body.title,
      stage: body.stage,
      value: body.value,
      probability: body.probability,
      contact_id: body.contact_id ?? null,
      pipeline_id: pipelineId,
      pipeline_stage_id: pipelineStageId,
      tenant_id: ctx.tenantId,
      owner_id: ctx.userId,
      stage_changed_at: now
    }).select().single();
    if (error) throw error;

    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'deal.create',
      entity: 'deal',
      entityId: data.id,
      metadata: { stage: body.stage, pipeline_id: pipelineId }
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'deal_create_failed' }, { status: 500 });
  }
}
