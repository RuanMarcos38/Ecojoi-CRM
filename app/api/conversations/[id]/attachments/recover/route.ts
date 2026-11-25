import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { requireFeature } from '@/lib/server/feature';
import { recoverEvolutionAttachment } from '@/lib/server/evolution';
import { createAdminClient } from '@/lib/supabase/admin';
import { canViewTeamAttendance } from '@/lib/attendance-access';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('conversations.manage');
    await requireFeature(ctx, 'atendimento');
    const { id } = await params;
    const input = z.object({ messageId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
    if (!input.success || !z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const query = supabase.from('conversations').select('id')
      .eq('tenant_id', ctx.tenantId).eq('id', id).eq('channel', 'whatsapp');
    if (!canViewTeamAttendance(ctx.role)) query.eq('assigned_to', ctx.userId);
    const { data: conversation, error } = await query.maybeSingle();
    if (error) throw error;
    if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const recovered = await recoverEvolutionAttachment(ctx.tenantId, id, input.data.messageId);
    return NextResponse.json({ recovered: Boolean(recovered) });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: 'attachment_recovery_failed' }, { status: 502 });
  }
}
