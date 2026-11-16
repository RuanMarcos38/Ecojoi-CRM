import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFeature } from '@/lib/server/feature';

const BUCKET = 'ecojoi-message-attachments';
const createSchema = z.object({
  contact_id: z.string().uuid().optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(2).max(140).optional(),
  channel: z.enum(['internal', 'whatsapp', 'instagram', 'facebook', 'email']).default('internal')
}).refine(body => Boolean(body.contact_id) !== Boolean(body.phone) && (!body.phone || body.channel === 'whatsapp') && (!body.name || Boolean(body.phone)));

function normalizeWhatsAppPhone(raw: string) {
  if (!/^\+?[\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  const local = !raw.startsWith('+') && (digits.length === 10 || digits.length === 11);
  const normalized = local ? `55${digits}` : digits;
  return /^[1-9]\d{7,14}$/.test(normalized) ? `+${normalized}` : null;
}

function phoneVariants(phone: string, raw: string) {
  const variants = [phone, phone.slice(1), raw];
  const local = phone.startsWith('+55') ? phone.slice(3) : '';
  if (local.length === 10 || local.length === 11) {
    const area = local.slice(0, 2);
    const number = `${local.slice(2, -4)}-${local.slice(-4)}`;
    variants.push(local, `(${area}) ${number}`, `(${area})${number}`, `${area} ${number}`, `+55 (${area}) ${number}`);
  }
  return [...new Set(variants)];
}

export async function GET(request: Request) {
  try {
    const ctx = await requirePermission('conversations.view');
    await requireFeature(ctx, 'atendimento');
    const supabase = await createClient();
    const target = new URL(request.url).searchParams.get('id');
    if (target && !z.string().uuid().safeParse(target).success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    let query = supabase
      .from('conversations')
      .select('id,status,channel,assigned_to,attendance_state,attendance_changed_at,updated_at,last_inbound_at,last_outbound_at,first_response_at,sla_due_at,ai_summary,ai_next_action,ai_summary_updated_at,assignee:profiles!conversations_assigned_to_fkey(id,full_name),contact:contacts(id,name,email,phone,source,owner_id,attribution,lead_score,lead_temperature,contact_tags(tag:tags(id,name))),messages(id,provider_message_id,reply_to_provider_id,whatsapp_reaction,sender_user_id,direction,body,status,message_type,attachment_path,attachment_name,attachment_mime,attachment_size,audio_duration_ms,created_at)')
      .eq('tenant_id', ctx.tenantId);
    if (target) query = query.eq('id', target);
    const { data, error } = await query.order('updated_at', { ascending: false }).limit(target ? 1 : 100);

    if (error) throw error;
    const senderIds = [...new Set((data ?? []).flatMap(conversation =>
      (conversation.messages ?? []).flatMap(message => message.sender_user_id ? [String(message.sender_user_id)] : [])
    ))];
    const names = new Map<string, string>();
    if (senderIds.length) {
      const admin = createAdminClient();
      for (let start = 0; start < senderIds.length; start += 100) {
        const { data: senders } = await admin.from('profiles').select('id,full_name')
          .eq('tenant_id', ctx.tenantId).in('id', senderIds.slice(start, start + 100));
        for (const sender of senders ?? []) names.set(sender.id, sender.full_name);
      }
    }

    const hydrated = await Promise.all((data ?? []).map(async conversation => {
      const messages = await Promise.all((conversation.messages ?? []).map(async (message: any) => {
        const sender_name = names.get(message.sender_user_id) ?? null;
        if (!message.attachment_path) return { ...message, sender_name, attachment_url: null };
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(message.attachment_path, 3600);
        return { ...message, sender_name, attachment_url: signed?.signedUrl ?? null };
      }));
      messages.sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
      return { ...conversation, messages };
    }));
    return NextResponse.json({ data: hydrated });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: 'conversation_fetch_failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('conversations.create');
    await requireFeature(ctx, 'atendimento');
    const body = createSchema.parse(await req.json());
    const supabase = await createClient();

    let contactId = body.contact_id;
    let createdContact = false;
    let phone: string | null = null;
    if (body.phone) {
      phone = normalizeWhatsAppPhone(body.phone);
      if (!phone) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
      const digits = phone.slice(1);
      const { data: channelContact, error: channelError } = await createAdminClient().from('contact_channels')
        .select('contact_id').eq('tenant_id', ctx.tenantId).eq('channel', 'whatsapp').eq('external_id', digits).limit(1).maybeSingle();
      if (channelError) throw channelError;
      contactId = channelContact?.contact_id;
      if (!contactId) {
        const { data: match, error: matchError } = await supabase.from('contacts')
          .select('id').eq('tenant_id', ctx.tenantId).in('phone', phoneVariants(phone, body.phone))
          .order('created_at', { ascending: true }).limit(1).maybeSingle();
        if (matchError) throw matchError;
        contactId = match?.id;
      }
      if (!contactId) {
        await requirePermission('contacts.create');
        const { data: saved, error: saveError } = await supabase.from('contacts')
          .insert({ tenant_id: ctx.tenantId, created_by: ctx.userId, owner_id: ctx.userId,
            name: body.name ?? `WhatsApp ${digits.slice(-4)}`, phone, status: 'lead', source: 'WhatsApp' })
          .select('id').single();
        if (saveError) throw saveError;
        contactId = saved.id;
        createdContact = true;
      }
    }

    const { data: contact, error: contactError } = await supabase.from('contacts').select('id,phone,name')
      .eq('id', contactId).eq('tenant_id', ctx.tenantId).maybeSingle();
    if (contactError) throw contactError;
    if (!contact) return NextResponse.json({ error: 'contact_not_found' }, { status: 404 });

    if (body.name && !createdContact && body.name !== contact.name) {
      await requirePermission('contacts.update');
      const { data: updated, error: nameError } = await supabase.from('contacts')
        .update({ name: body.name, updated_at: new Date().toISOString() })
        .eq('tenant_id', ctx.tenantId).eq('id', contact.id).select('id').maybeSingle();
      if (nameError) throw nameError;
      if (!updated) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    if (body.channel === 'whatsapp') {
      const { data: existing, error: lookupError } = await supabase.from('conversations')
        .select('id,attendance_state').eq('tenant_id', ctx.tenantId).eq('contact_id', contact.id)
        .eq('channel', 'whatsapp').neq('status', 'closed')
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) return NextResponse.json({ data: existing });
      if (!phone && !contact.phone) return NextResponse.json({ error: 'phone_required' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        tenant_id: ctx.tenantId,
        contact_id: contact.id,
        channel: body.channel,
        status: 'open',
        assigned_to: ctx.userId,
        attendance_state: 'in_service',
        attendance_changed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    return NextResponse.json({ error: 'conversation_create_failed' }, { status: 500 });
  }
}
