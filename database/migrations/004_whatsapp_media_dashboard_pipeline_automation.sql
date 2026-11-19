-- Ecojoi CRM - mídia no atendimento, automações de pipeline e métricas operacionais.
-- Mantém o isolamento por tenant e amplia somente estruturas existentes.

-- 1) Mensagens com mídia/áudio/documentos.
alter table public.messages
  add column if not exists message_type text not null default 'text';

alter table public.messages
  add column if not exists attachment_path text;

alter table public.messages
  add column if not exists attachment_name text;

alter table public.messages
  add column if not exists attachment_mime text;

alter table public.messages
  add column if not exists attachment_size bigint;

alter table public.messages
  add column if not exists audio_duration_ms integer;

do $$ begin
  alter table public.messages
    add constraint messages_message_type_check
    check (message_type in ('text','image','audio','file','system'));
exception when duplicate_object then null; end $$;

-- Bucket privado. Os objetos são gravados no caminho <tenant_id>/<conversation_id>/arquivo.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'ecojoi-message-attachments',
  'ecojoi-message-attachments',
  false,
  26214400,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav',
    'application/pdf','text/plain','text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists ecojoi_message_attachments_select on storage.objects;
create policy ecojoi_message_attachments_select on storage.objects
for select to authenticated
using (
  bucket_id='ecojoi-message-attachments'
  and (storage.foldername(name))[1]=public.current_tenant_id()::text
  and public.has_permission('conversations.view')
);

drop policy if exists ecojoi_message_attachments_insert on storage.objects;
create policy ecojoi_message_attachments_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='ecojoi-message-attachments'
  and (storage.foldername(name))[1]=public.current_tenant_id()::text
  and public.has_permission('conversations.send')
);

drop policy if exists ecojoi_message_attachments_update on storage.objects;
create policy ecojoi_message_attachments_update on storage.objects
for update to authenticated
using (
  bucket_id='ecojoi-message-attachments'
  and (storage.foldername(name))[1]=public.current_tenant_id()::text
  and public.has_permission('conversations.manage')
)
with check (
  bucket_id='ecojoi-message-attachments'
  and (storage.foldername(name))[1]=public.current_tenant_id()::text
  and public.has_permission('conversations.manage')
);

drop policy if exists ecojoi_message_attachments_delete on storage.objects;
create policy ecojoi_message_attachments_delete on storage.objects
for delete to authenticated
using (
  bucket_id='ecojoi-message-attachments'
  and (storage.foldername(name))[1]=public.current_tenant_id()::text
  and public.has_permission('conversations.manage')
);

-- 2) Tempo na etapa do pipeline.
alter table public.deals
  add column if not exists stage_changed_at timestamptz not null default now();

update public.deals
set stage_changed_at=coalesce(updated_at,created_at,now())
where stage_changed_at is null;

create index if not exists deals_tenant_stage_changed_idx
  on public.deals(tenant_id,stage,stage_changed_at);

-- 3) Regras de mensagem automática por etapa e tempo.
create table if not exists public.pipeline_message_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  stage text not null check (stage in ('new','qualification','proposal','closing','won','lost')),
  wait_minutes integer not null default 1440 check (wait_minutes between 1 and 525600),
  channel text not null default 'internal' check (channel in ('internal','whatsapp','email')),
  message_template text not null,
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pipeline_rules_tenant_stage_idx
  on public.pipeline_message_rules(tenant_id,stage,enabled);

alter table public.pipeline_message_rules enable row level security;

drop policy if exists pipeline_rules_select on public.pipeline_message_rules;
create policy pipeline_rules_select on public.pipeline_message_rules
for select using (
  public.has_tenant_access(tenant_id)
  and public.has_permission('automations.view')
);

drop policy if exists pipeline_rules_insert on public.pipeline_message_rules;
create policy pipeline_rules_insert on public.pipeline_message_rules
for insert with check (
  public.has_tenant_access(tenant_id)
  and public.has_permission('automations.manage')
);

drop policy if exists pipeline_rules_update on public.pipeline_message_rules;
create policy pipeline_rules_update on public.pipeline_message_rules
for update using (
  public.has_tenant_access(tenant_id)
  and public.has_permission('automations.manage')
)
with check (
  public.has_tenant_access(tenant_id)
  and public.has_permission('automations.manage')
);

drop policy if exists pipeline_rules_delete on public.pipeline_message_rules;
create policy pipeline_rules_delete on public.pipeline_message_rules
for delete using (
  public.has_tenant_access(tenant_id)
  and public.has_permission('automations.manage')
);

create table if not exists public.pipeline_automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rule_id uuid not null references public.pipeline_message_rules(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  stage_changed_at timestamptz not null,
  message_id uuid references public.messages(id) on delete set null,
  status text not null default 'processed' check (status in ('processed','queued','failed')),
  error text,
  executed_at timestamptz not null default now(),
  unique(rule_id,deal_id,stage_changed_at)
);

create index if not exists pipeline_runs_tenant_executed_idx
  on public.pipeline_automation_runs(tenant_id,executed_at desc);

alter table public.pipeline_automation_runs enable row level security;

drop policy if exists pipeline_runs_select on public.pipeline_automation_runs;
create policy pipeline_runs_select on public.pipeline_automation_runs
for select using (
  public.has_tenant_access(tenant_id)
  and public.has_permission('automations.view')
);

-- 4) Execução automática. Para canais externos, a mensagem fica em 'queued'
-- até existir um provider oficial configurado; em canal interno, fica 'sent'.
create or replace function public.run_pipeline_message_automations()
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  r record;
  v_conversation_id uuid;
  v_message_id uuid;
  v_body text;
  v_status text;
  v_count integer := 0;
begin
  for r in
    select
      rule.id as rule_id,
      rule.tenant_id,
      rule.channel,
      rule.message_template,
      deal.id as deal_id,
      deal.title as deal_title,
      deal.stage_changed_at,
      deal.contact_id,
      contact.name as contact_name
    from public.pipeline_message_rules rule
    join public.deals deal
      on deal.tenant_id=rule.tenant_id
     and deal.stage=rule.stage
    join public.contacts contact
      on contact.id=deal.contact_id
     and contact.tenant_id=deal.tenant_id
    where rule.enabled=true
      and deal.contact_id is not null
      and deal.stage_changed_at + make_interval(mins=>rule.wait_minutes) <= now()
      and not exists (
        select 1 from public.pipeline_automation_runs run
        where run.rule_id=rule.id
          and run.deal_id=deal.id
          and run.stage_changed_at=deal.stage_changed_at
      )
  loop
    begin
      select c.id into v_conversation_id
      from public.conversations c
      where c.tenant_id=r.tenant_id
        and c.contact_id=r.contact_id
        and c.status <> 'closed'
        and (r.channel='internal' or c.channel=r.channel)
      order by c.updated_at desc
      limit 1;

      if v_conversation_id is null then
        insert into public.conversations(
          tenant_id,contact_id,channel,status,attendance_state,attendance_changed_at
        ) values(
          r.tenant_id,r.contact_id,r.channel,'open','automatic',now()
        ) returning id into v_conversation_id;
      end if;

      v_body := replace(
        replace(
          replace(r.message_template,'{{nome}}',coalesce(r.contact_name,'')),
          '{{oportunidade}}',coalesce(r.deal_title,'')
        ),
        '{{etapa}}',coalesce((select stage from public.deals where id=r.deal_id),'')
      );
      v_status := case when r.channel='internal' then 'sent' else 'queued' end;

      insert into public.messages(
        tenant_id,conversation_id,direction,body,status,message_type
      ) values(
        r.tenant_id,v_conversation_id,'outbound',v_body,v_status,'text'
      ) returning id into v_message_id;

      update public.conversations
      set updated_at=now()
      where id=v_conversation_id and tenant_id=r.tenant_id;

      insert into public.pipeline_automation_runs(
        tenant_id,rule_id,deal_id,stage_changed_at,message_id,status
      ) values(
        r.tenant_id,r.rule_id,r.deal_id,r.stage_changed_at,v_message_id,
        case when r.channel='internal' then 'processed' else 'queued' end
      );
      v_count := v_count + 1;
    exception when others then
      insert into public.pipeline_automation_runs(
        tenant_id,rule_id,deal_id,stage_changed_at,status,error
      ) values(
        r.tenant_id,r.rule_id,r.deal_id,r.stage_changed_at,'failed',left(sqlerrm,1000)
      ) on conflict(rule_id,deal_id,stage_changed_at) do nothing;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.run_pipeline_message_automations() from public;
revoke all on function public.run_pipeline_message_automations() from anon;
revoke all on function public.run_pipeline_message_automations() from authenticated;
grant execute on function public.run_pipeline_message_automations() to service_role;

-- 5) Agendamento a cada 5 minutos via pg_cron.
create extension if not exists pg_cron with schema extensions;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='ecojoi_pipeline_automation_5min' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule(
    'ecojoi_pipeline_automation_5min',
    '*/5 * * * *',
    'select public.run_pipeline_message_automations();'
  );
end $$;
