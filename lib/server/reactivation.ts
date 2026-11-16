import { createAdminClient } from '@/lib/supabase/admin';
import { FOLLOW_UP_TEMPLATE_NAME, liveReactivationTemplate, reactivationWhatsAppHealth, sendWhatsAppTemplate } from '@/lib/server/meta';
import { getWhatsAppProvider } from '@/lib/server/whatsapp';

export function isReactivationTemplate(template: { category?: string; status?: string; components?: unknown } | null) {
  if (template?.category !== 'MARKETING' || template.status !== 'APPROVED' || !Array.isArray(template.components)) return false;
  const components = template.components as { type: string; format?: string; text?: string }[];
  return components.every(component =>
    (['BODY', 'FOOTER'].includes(component.type) || (component.type === 'HEADER' && component.format === 'TEXT')) &&
    typeof component.text === 'string' && !component.text.includes('{{')
  ) && components.some(component => component.type === 'BODY' && /\bSAIR\b/i.test(component.text ?? ''));
}

export async function enqueueLeadFollowUps() {
  const db = createAdminClient();
  const { data: settings, error } = await db.from('whatsapp_lead_follow_up_settings')
    .select('tenant_id,requested_by').eq('enabled', true);
  if (error) throw error;
  for (const entry of settings ?? []) {
    try {
      const { data: activeJob } = await db.from('whatsapp_reactivation_campaigns')
        .select('id').eq('tenant_id', entry.tenant_id).in('status', ['queued', 'paused']).limit(1).maybeSingle();
      if (activeJob) continue;
      const { data: lead } = await db.rpc('whatsapp_lead_follow_up_candidate', { p_tenant: entry.tenant_id }).maybeSingle();
      if (!lead) continue;
      const { data: model } = await db.from('whatsapp_templates').select('id,meta_template_id')
        .eq('tenant_id', entry.tenant_id).eq('name', FOLLOW_UP_TEMPLATE_NAME).eq('language', 'pt_BR').maybeSingle();
      if (!model?.meta_template_id || await getWhatsAppProvider(entry.tenant_id) !== 'meta') continue;
      const live = await liveReactivationTemplate(model.meta_template_id);
      if (!isReactivationTemplate(live) || live.name !== FOLLOW_UP_TEMPLATE_NAME || live.language !== 'pt_BR') continue;
      const { error: insertError } = await db.from('whatsapp_reactivation_campaigns').insert({
        id: crypto.randomUUID(), tenant_id: entry.tenant_id, created_by: entry.requested_by, template_id: model.id,
        follow_up_contact_id: (lead as { contact_id: string }).contact_id, phones: [(lead as { phone: string }).phone]
      });
      if (insertError && insertError.code !== '23505') throw insertError;
    } catch {
      console.error('[CRM] Falha ao preparar follow-up automático.');
    }
  }
}

export async function workReactivationQueue(tenantId?: string) {
  const db = createAdminClient();
  const now = new Date().toISOString();
  let stale = db.from('whatsapp_reactivation_campaigns').update({
    status: 'paused', processing: false, last_result: 'resultado_incerto'
  }).eq('processing', true).lt('claimed_at', new Date(Date.now() - 300000).toISOString());
  let due = db.from('whatsapp_reactivation_campaigns')
    .select('id,tenant_id,template_id,phones,cursor_pos,accepted,skipped,follow_up_contact_id')
    .eq('status', 'queued').eq('processing', false).lte('next_at', now).order('next_at').limit(5);
  if (tenantId) { stale = stale.eq('tenant_id', tenantId); due = due.eq('tenant_id', tenantId); }
  const { error: staleError } = await stale;
  if (staleError) throw staleError;
  const { data: campaigns, error } = await due;
  if (error) throw error;

  for (const job of campaigns ?? []) {
    const { data: claim } = await db.from('whatsapp_reactivation_campaigns')
      .update({ processing: true, claimed_at: now })
      .eq('id', job.id).eq('status', 'queued').eq('processing', false).eq('cursor_pos', job.cursor_pos)
      .select('id').maybeSingle();
    if (!claim) continue;

    const release = (fields: Record<string, unknown>) =>
      db.from('whatsapp_reactivation_campaigns').update({ ...fields, processing: false, claimed_at: null })
        .eq('id', job.id).eq('claimed_at', now);

    try {
      const phone = job.phones[job.cursor_pos];
      if (!phone) { await release({ status: 'completed' }); continue; }
      const { data: template, error: templateError } = await db.from('whatsapp_templates')
        .select('meta_template_id').eq('tenant_id', job.tenant_id).eq('id', job.template_id).maybeSingle();
      if (templateError) throw templateError;
      if (await getWhatsAppProvider(job.tenant_id) !== 'meta' || !(await reactivationWhatsAppHealth(job.tenant_id))) {
        await release({ status: 'paused', last_result: 'qualidade_ou_canal_indisponivel' });
        continue;
      }
      const live = template?.meta_template_id ? await liveReactivationTemplate(template.meta_template_id) : null;
      if (!isReactivationTemplate(live)) {
        await release({ status: 'paused', last_result: 'modelo_indisponivel' });
        continue;
      }
      const { data: audience, error: audienceError } = await db.rpc('reactivation_audience', {
        p_tenant: job.tenant_id, p_phones: [phone]
      });
      if (audienceError) throw audienceError;
      const nextAt = new Date(Date.now() + 60000).toISOString();
      const finished = job.cursor_pos + 1 >= job.phones.length;
      let eligible = Boolean(audience?.length);
      if (eligible && job.follow_up_contact_id) {
        const [rule, candidate] = await Promise.all([
          db.from('whatsapp_lead_follow_up_settings').select('enabled').eq('tenant_id', job.tenant_id).maybeSingle(),
          db.rpc('whatsapp_lead_follow_up_candidate', {
            p_tenant: job.tenant_id, p_contact: job.follow_up_contact_id
          }).maybeSingle()
        ]);
        if (rule.error || candidate.error) throw rule.error ?? candidate.error;
        eligible = rule.data?.enabled === true && (candidate.data as { phone?: string } | null)?.phone === phone;
      }
      if (!eligible) {
        await release({ cursor_pos: job.cursor_pos + 1, skipped: job.skipped + 1,
          ...(finished ? { status: 'completed' } : {}), next_at: nextAt });
        continue;
      }
      // Advance before contacting the provider. An ambiguous response is never retried.
      const { data: reserved, error: reserveError } = await db.from('whatsapp_reactivation_campaigns')
        .update({ cursor_pos: job.cursor_pos + 1, next_at: nextAt })
        .eq('id', job.id).eq('status', 'queued').eq('claimed_at', now)
        .select('id').maybeSingle();
      if (reserveError) throw reserveError;
      if (!reserved) { await release({}); continue; }

      const result = await sendWhatsAppTemplate(job.tenant_id, phone, live.name, live.language);
      if (!result.delivered || !result.providerMessageId) {
        await release({ status: 'paused', last_result: 'meta_recusou_ou_resultado_incerto' });
        continue;
      }
      const { error: trackingError } = await db.from('whatsapp_reactivation_deliveries').insert({
        campaign_id: job.id, tenant_id: job.tenant_id, provider_message_id: result.providerMessageId
      });
      if (trackingError) throw trackingError;
      await release({ accepted: job.accepted + 1, ...(finished ? { status: 'completed' } : {}) });
    } catch {
      await release({ status: 'paused', last_result: 'falha_ou_resultado_incerto' });
    }
  }
  return { inspected: campaigns?.length ?? 0 };
}
