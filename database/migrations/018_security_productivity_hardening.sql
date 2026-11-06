-- Ecojoi CRM - Security & Productivity hardening.
-- Preserva estruturas existentes e adapta módulos comerciais já presentes.

alter table public.webhook_deliveries
  drop constraint if exists webhook_deliveries_status_check;
alter table public.webhook_deliveries
  add constraint webhook_deliveries_status_check
  check (status in ('pending','sent','failed','dead_letter'));

create table if not exists public.webhook_secrets (
  subscription_id uuid primary key references public.webhook_subscriptions(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  signing_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists webhook_secrets_tenant_idx on public.webhook_secrets(tenant_id);
alter table public.webhook_secrets enable row level security;
revoke all on table public.webhook_secrets from anon,authenticated;
grant select,insert,update,delete on table public.webhook_secrets to service_role;

insert into public.webhook_secrets(subscription_id,tenant_id,signing_key)
select id,tenant_id,secret_hash from public.webhook_subscriptions
where secret_hash is not null and length(secret_hash)>0
on conflict(subscription_id) do nothing;

alter table public.customer_surveys
  add column if not exists name text,
  add column if not exists survey_type text,
  add column if not exists question text,
  add column if not exists active boolean not null default true,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

update public.customer_surveys
set survey_type=coalesce(survey_type,kind),
    name=coalesce(name,upper(kind)),
    question=coalesce(question,case when kind='nps' then 'Qual a probabilidade de recomendar nossa empresa?' else 'Como você avalia seu atendimento?' end)
where survey_type is null or name is null or question is null;

create table if not exists public.user_security_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  require_mfa boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_security_preferences enable row level security;
drop policy if exists user_security_preferences_select on public.user_security_preferences;
create policy user_security_preferences_select on public.user_security_preferences for select
using(user_id=(select auth.uid()) and public.has_tenant_access(tenant_id));
drop policy if exists user_security_preferences_write on public.user_security_preferences;
create policy user_security_preferences_write on public.user_security_preferences for all
using(user_id=(select auth.uid()) and public.has_tenant_access(tenant_id))
with check(user_id=(select auth.uid()) and public.has_tenant_access(tenant_id));

create index if not exists sales_goals_user_fk_idx on public.sales_goals(user_id) where user_id is not null;
create index if not exists webhook_deliveries_subscription_fk_idx on public.webhook_deliveries(subscription_id);
create index if not exists proposal_items_product_fk_idx on public.proposal_items(product_id) where product_id is not null;
create index if not exists proposals_contact_fk_idx on public.proposals(contact_id) where contact_id is not null;
create index if not exists proposals_deal_fk_idx on public.proposals(deal_id) where deal_id is not null;
create index if not exists proposals_created_by_fk_idx on public.proposals(created_by) where created_by is not null;
create index if not exists sales_sequences_created_by_fk_idx on public.sales_sequences(created_by) where created_by is not null;
create index if not exists sales_sequence_enrollments_contact_fk_idx on public.sales_sequence_enrollments(contact_id);
create index if not exists sales_sequence_enrollments_enrolled_by_fk_idx on public.sales_sequence_enrollments(enrolled_by) where enrolled_by is not null;
create index if not exists customer_surveys_created_by_fk_idx on public.customer_surveys(created_by) where created_by is not null;
create index if not exists customer_survey_responses_contact_fk_idx on public.customer_survey_responses(contact_id) where contact_id is not null;
create index if not exists saved_views_user_fk_idx on public.saved_views(user_id);
create index if not exists capture_forms_created_by_fk_idx on public.capture_forms(created_by) where created_by is not null;
create index if not exists capture_form_submissions_contact_fk_idx on public.capture_form_submissions(contact_id) where contact_id is not null;
create index if not exists booking_links_owner_fk_idx on public.booking_links(owner_id) where owner_id is not null;
create index if not exists booking_requests_contact_fk_idx on public.booking_requests(contact_id) where contact_id is not null;
create index if not exists webchat_sessions_contact_fk_idx on public.webchat_sessions(contact_id) where contact_id is not null;
create index if not exists customer_survey_invitations_contact_fk_idx on public.customer_survey_invitations(contact_id) where contact_id is not null;
