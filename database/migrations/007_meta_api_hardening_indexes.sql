-- Ajustes de hardening/índices das estruturas adicionadas em 006.

create index if not exists contacts_owner_id_idx
  on public.contacts(owner_id)
  where owner_id is not null;

create index if not exists contact_channels_contact_id_idx
  on public.contact_channels(contact_id);

create index if not exists api_keys_created_by_idx
  on public.api_keys(created_by)
  where created_by is not null;

drop policy if exists contact_channels_service_role on public.contact_channels;
create policy contact_channels_service_role on public.contact_channels
for all to service_role
using (true)
with check (true);

drop policy if exists integration_events_service_role on public.integration_events;
create policy integration_events_service_role on public.integration_events
for all to service_role
using (true)
with check (true);

drop policy if exists api_keys_service_role on public.api_keys;
create policy api_keys_service_role on public.api_keys
for all to service_role
using (true)
with check (true);
