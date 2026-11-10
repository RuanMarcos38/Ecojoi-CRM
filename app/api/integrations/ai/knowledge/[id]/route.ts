import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const inputSchema = z.object({
  name: z.string().trim().min(2).max(180).optional(),
  text: z.string().trim().min(1).max(120000).optional(),
  active: z.boolean().optional()
}).refine(value => Object.keys(value).length > 0);

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const ctx = await requirePermission('settings.view');
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from('ai_knowledge_documents')
      .select('id,name,extracted_text,active,updated_at')
      .eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not_found' },{status:404});
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'knowledge_fetch_failed' },{status:500});
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const ctx = await requirePermission('settings.manage');
    const { id } = await params;
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error:'invalid_payload' },{status:400});
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.text !== undefined) update.extracted_text = parsed.data.text;
    if (parsed.data.active !== undefined) update.active = parsed.data.active;
    const supabase = await createClient();
    const { data, error } = await supabase.from('ai_knowledge_documents')
      .update(update).eq('tenant_id',ctx.tenantId).eq('id',id)
      .select('id,name,active,updated_at').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error:'not_found' },{status:404});
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'ai.knowledge_update',entity:'ai_knowledge_documents',entityId:id,metadata:{fields:Object.keys(parsed.data)}});
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error:'knowledge_update_failed' },{status:500});
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const ctx = await requirePermission('settings.manage');
    if (ctx.role !== 'super_admin') return NextResponse.json({error:'master_required'},{status:403});
    const { id } = await params;
    const supabase = await createClient();
    const { data: existing, error: readError } = await supabase.from('ai_knowledge_documents')
      .select('id,name').eq('tenant_id',ctx.tenantId).eq('id',id).maybeSingle();
    if (readError) throw readError;
    if (!existing) return NextResponse.json({error:'not_found'},{status:404});
    const {error} = await supabase.from('ai_knowledge_documents').delete().eq('tenant_id',ctx.tenantId).eq('id',id);
    if(error) throw error;
    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'ai.knowledge_delete',entity:'ai_knowledge_documents',entityId:id,metadata:{name:existing.name}});
    return NextResponse.json({data:{id}});
  } catch(error) {
    if(error instanceof Response) return error;
    return NextResponse.json({error:'knowledge_delete_failed'},{status:500});
  }
}
