import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const definition = z.object({
  name: z.string().trim().min(2).max(100),
  stages: z.array(z.string().trim().min(1).max(80)).min(1).max(30)
}).refine(({ stages }) => new Set(stages.map(name => name.toLowerCase())).size === stages.length);

export async function GET() {
  try {
    const ctx = await requirePermission('deals.view');
    const supabase = await createClient();
    const { data, error } = await supabase.from('custom_pipelines')
      .select('id,name,stages').eq('tenant_id', ctx.tenantId).order('name');
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'Não foi possível listar os funis.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePermission('automations.manage');
    const body = definition.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase.from('custom_pipelines').insert({
      tenant_id: ctx.tenantId,
      name: body.name,
      stages: body.stages.map(name => ({ id: `custom_${randomUUID()}`, name }))
    }).select('id,name,stages').single();
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'Já existe um funil com esse nome.' }, { status: 409 });
    }
    if (error) throw error;
    await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'pipeline.create', entity: 'pipeline', entityId: data.id });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Informe o nome do funil e etapas com nomes distintos.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Não foi possível criar o funil.' }, { status: 500 });
  }
}
