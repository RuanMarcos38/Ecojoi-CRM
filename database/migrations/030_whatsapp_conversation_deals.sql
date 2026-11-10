-- Sincronizacao aditiva WhatsApp -> Funil (mantem os registros atuais).
-- Aplicar somente apos backup e verificacao em homologacao.
create table if not exists public.whatsapp_conversation_deals (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, deal_id)
);
create index if not exists whatsapp_conversation_deals_tenant_idx
  on public.whatsapp_conversation_deals (tenant_id, created_at desc);
alter table public.whatsapp_conversation_deals enable row level security;
drop policy if exists whatsapp_conversation_deals_select on public.whatsapp_conversation_deals;
create policy whatsapp_conversation_deals_select on public.whatsapp_conversation_deals
  for select to authenticated
  using (public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));

create or replace function public.ensure_whatsapp_conversation_deal()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
declare
  v_conversation record;
  v_contact record;
  v_deal uuid;
begin
  if tg_table_name = 'messages' then
    if new.direction <> 'inbound' then return new; end if;
    select id,tenant_id,contact_id,channel,assigned_to
      into v_conversation from public.conversations
      where id = new.conversation_id and tenant_id = new.tenant_id;
  else
    select new.id as id,new.tenant_id as tenant_id,new.contact_id as contact_id,
           new.channel as channel,new.assigned_to as assigned_to into v_conversation;
  end if;
  if v_conversation.id is null or v_conversation.channel <> 'whatsapp' then return new; end if;

  -- Serializa webhooks concorrentes da mesma conversa antes de criar a oportunidade.
  perform pg_advisory_xact_lock(hashtextextended(v_conversation.id::text, 0));
  if exists (select 1 from public.whatsapp_conversation_deals where conversation_id=v_conversation.id)
  then return new; end if;

  select id,name,phone,owner_id into v_contact from public.contacts
  where id=v_conversation.contact_id and tenant_id=v_conversation.tenant_id;
  if v_contact.id is null then raise exception 'whatsapp_contact_missing'; end if;

  insert into public.deals(
    tenant_id,contact_id,title,stage,value,probability,owner_id,stage_changed_at
  ) values (
    v_conversation.tenant_id,
    v_contact.id,
    left('WhatsApp · ' || v_contact.name || coalesce(' · ' || nullif(v_contact.phone,''),''),180),
    'new',0,10,coalesce(v_conversation.assigned_to,v_contact.owner_id),now()
  ) returning id into v_deal;

  insert into public.whatsapp_conversation_deals(tenant_id,conversation_id,deal_id)
  values(v_conversation.tenant_id,v_conversation.id,v_deal);
  return new;
end;
$$;
revoke all on function public.ensure_whatsapp_conversation_deal() from public,anon,authenticated;

drop trigger if exists trg_whatsapp_deal_on_conversation on public.conversations;
create trigger trg_whatsapp_deal_on_conversation
after insert on public.conversations for each row
when (new.channel='whatsapp')
execute function public.ensure_whatsapp_conversation_deal();

-- Conversas existentes que ainda nao tem oportunidade recebem card no primeiro novo inbound.
drop trigger if exists trg_whatsapp_deal_on_inbound on public.messages;
create trigger trg_whatsapp_deal_on_inbound
after insert on public.messages for each row
when (new.direction='inbound')
execute function public.ensure_whatsapp_conversation_deal();
