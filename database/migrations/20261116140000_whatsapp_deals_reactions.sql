alter table public.messages add column if not exists whatsapp_reaction text;

create or replace function public.ensure_whatsapp_conversation_deal()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  customer_name text;
  customer_owner uuid;
begin
  select p.name, p.owner_id into customer_name, customer_owner
  from public.contacts p
  where p.id = new.contact_id and p.tenant_id = new.tenant_id
  for no key update;

  if not found or exists (
    select 1 from public.deals d
    where d.tenant_id = new.tenant_id and d.contact_id = new.contact_id
      and d.stage in ('new', 'qualification', 'proposal', 'closing')
  ) then
    return new;
  end if;

  insert into public.deals (id, tenant_id, contact_id, owner_id, title, stage)
  values (new.id, new.tenant_id, new.contact_id, coalesce(new.assigned_to, customer_owner),
          left('Oportunidade - ' || customer_name, 180), 'new')
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'WhatsApp opportunity creation failed (%).', SQLSTATE;
  return new;
end;
$$;

revoke execute on function public.ensure_whatsapp_conversation_deal() from public, anon, authenticated;
grant execute on function public.ensure_whatsapp_conversation_deal() to service_role;

drop trigger if exists ensure_whatsapp_conversation_deal on public.conversations;
create trigger ensure_whatsapp_conversation_deal
after update of last_inbound_at on public.conversations
for each row when (
  new.channel = 'whatsapp' and new.status <> 'closed' and new.last_inbound_at is not null
  and old.last_inbound_at is distinct from new.last_inbound_at
)
execute function public.ensure_whatsapp_conversation_deal();
