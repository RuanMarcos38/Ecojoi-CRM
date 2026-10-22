-- Ecojoi CRM - Workers, webhook event queue and execution observability.

alter table public.webhook_deliveries
  add column if not exists max_attempts integer not null default 5,
  add column if not exists next_attempt_at timestamptz not null default now();

create index if not exists webhook_deliveries_due_idx
  on public.webhook_deliveries(status,next_attempt_at)
  where status in ('pending','failed');

alter table public.sales_sequence_enrollments
  add column if not exists last_error text;

create table if not exists public.worker_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  worker_name text not null,
  status text not null check(status in ('started','success','failed')),
  processed integer not null default 0,
  succeeded integer not null default 0,
  failed integer not null default 0,
  duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists worker_runs_tenant_created_idx
  on public.worker_runs(tenant_id,created_at desc);

alter table public.worker_runs enable row level security;
drop policy if exists worker_runs_select on public.worker_runs;
create policy worker_runs_select on public.worker_runs for select
using (tenant_id is null or (public.has_tenant_access(tenant_id) and public.has_permission('settings.view')));

create or replace function public.queue_webhook_event(
  p_tenant_id uuid,
  p_event_type text,
  p_entity_id text,
  p_payload jsonb default '{}'::jsonb
) returns integer
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select id from public.webhook_subscriptions
    where tenant_id=p_tenant_id
      and active=true
      and p_event_type=any(events)
  loop
    insert into public.webhook_deliveries(
      tenant_id,subscription_id,event_type,entity_id,payload,status,attempts,max_attempts,next_attempt_at
    ) values(
      p_tenant_id,r.id,p_event_type,p_entity_id,coalesce(p_payload,'{}'::jsonb),'pending',0,5,now()
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.queue_webhook_event(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.queue_webhook_event(uuid,text,text,jsonb) to service_role;

create or replace function public.webhook_event_contact_insert()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  perform public.queue_webhook_event(
    new.tenant_id,
    case when new.status='lead' then 'lead.created' else 'contact.updated' end,
    new.id::text,
    jsonb_build_object('id',new.id,'name',new.name,'email',new.email,'phone',new.phone,'source',new.source,'status',new.status)
  );
  return new;
end;
$$;

drop trigger if exists contacts_webhook_insert on public.contacts;
create trigger contacts_webhook_insert after insert on public.contacts
for each row execute function public.webhook_event_contact_insert();

create or replace function public.webhook_event_contact_update()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  perform public.queue_webhook_event(
    new.tenant_id,'contact.updated',new.id::text,
    jsonb_build_object('id',new.id,'name',new.name,'email',new.email,'phone',new.phone,'source',new.source,'status',new.status)
  );
  return new;
end;
$$;

drop trigger if exists contacts_webhook_update on public.contacts;
create trigger contacts_webhook_update after update on public.contacts
for each row when (old is distinct from new)
execute function public.webhook_event_contact_update();

create or replace function public.webhook_event_message_insert()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  perform public.queue_webhook_event(
    new.tenant_id,
    case when new.direction='inbound' then 'conversation.received' else 'message.sent' end,
    new.id::text,
    jsonb_build_object('id',new.id,'conversation_id',new.conversation_id,'direction',new.direction,'message_type',coalesce(new.message_type,'text'),'status',new.status)
  );
  return new;
end;
$$;

drop trigger if exists messages_webhook_insert on public.messages;
create trigger messages_webhook_insert after insert on public.messages
for each row execute function public.webhook_event_message_insert();

create or replace function public.webhook_event_deal_insert()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  perform public.queue_webhook_event(
    new.tenant_id,'deal.created',new.id::text,
    jsonb_build_object('id',new.id,'title',new.title,'stage',new.stage,'value',new.value,'contact_id',new.contact_id)
  );
  return new;
end;
$$;

drop trigger if exists deals_webhook_insert on public.deals;
create trigger deals_webhook_insert after insert on public.deals
for each row execute function public.webhook_event_deal_insert();

create or replace function public.webhook_event_deal_won()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.stage='won' and old.stage is distinct from new.stage then
    perform public.queue_webhook_event(
      new.tenant_id,'deal.won',new.id::text,
      jsonb_build_object('id',new.id,'title',new.title,'stage',new.stage,'value',new.value,'contact_id',new.contact_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists deals_webhook_won on public.deals;
create trigger deals_webhook_won after update of stage on public.deals
for each row execute function public.webhook_event_deal_won();

create or replace function public.webhook_event_task_insert()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  perform public.queue_webhook_event(
    new.tenant_id,'task.created',new.id::text,
    jsonb_build_object('id',new.id,'title',new.title,'priority',new.priority,'due_at',new.due_at,'related_contact_id',new.related_contact_id)
  );
  return new;
end;
$$;

drop trigger if exists tasks_webhook_insert on public.tasks;
create trigger tasks_webhook_insert after insert on public.tasks
for each row execute function public.webhook_event_task_insert();

create or replace function public.webhook_event_proposal_insert()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  perform public.queue_webhook_event(
    new.tenant_id,'proposal.created',new.id::text,
    jsonb_build_object('id',new.id,'title',new.title,'status',new.status,'total',new.total,'contact_id',new.contact_id,'deal_id',new.deal_id)
  );
  return new;
end;
$$;

drop trigger if exists proposals_webhook_insert on public.proposals;
create trigger proposals_webhook_insert after insert on public.proposals
for each row execute function public.webhook_event_proposal_insert();

create or replace function public.webhook_event_booking_insert()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  perform public.queue_webhook_event(
    new.tenant_id,'booking.created',new.id::text,
    jsonb_build_object('id',new.id,'name',new.name,'email',new.email,'phone',new.phone,'starts_at',new.starts_at,'ends_at',new.ends_at,'contact_id',new.contact_id)
  );
  return new;
end;
$$;

drop trigger if exists booking_webhook_insert on public.booking_requests;
create trigger booking_webhook_insert after insert on public.booking_requests
for each row execute function public.webhook_event_booking_insert();
