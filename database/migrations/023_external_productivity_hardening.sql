-- Ecojoi CRM - hardening da camada externa adicionada em 022.
create index if not exists external_connections_created_by_idx
  on public.external_connections(created_by)
  where created_by is not null;

create index if not exists external_calendar_connection_idx
  on public.external_calendar_events(connection_id)
  where connection_id is not null;

create index if not exists external_calendar_contact_fk_idx
  on public.external_calendar_events(contact_id)
  where contact_id is not null;

create index if not exists external_emails_connection_idx
  on public.external_emails(connection_id)
  where connection_id is not null;

create index if not exists external_emails_contact_fk_idx
  on public.external_emails(contact_id)
  where contact_id is not null;

create index if not exists transcripts_contact_fk_idx
  on public.interaction_transcripts(contact_id)
  where contact_id is not null;

create index if not exists transcripts_deal_fk_idx
  on public.interaction_transcripts(deal_id)
  where deal_id is not null;

create index if not exists dashboard_widgets_user_fk_idx
  on public.user_dashboard_widgets(user_id);

drop policy if exists dashboard_widgets_write on public.user_dashboard_widgets;
drop policy if exists dashboard_widgets_insert on public.user_dashboard_widgets;
drop policy if exists dashboard_widgets_update on public.user_dashboard_widgets;
drop policy if exists dashboard_widgets_delete on public.user_dashboard_widgets;

create policy dashboard_widgets_insert on public.user_dashboard_widgets
for insert
with check(public.has_tenant_access(tenant_id) and user_id=(select auth.uid()));

create policy dashboard_widgets_update on public.user_dashboard_widgets
for update
using(public.has_tenant_access(tenant_id) and user_id=(select auth.uid()))
with check(public.has_tenant_access(tenant_id) and user_id=(select auth.uid()));

create policy dashboard_widgets_delete on public.user_dashboard_widgets
for delete
using(public.has_tenant_access(tenant_id) and user_id=(select auth.uid()));
