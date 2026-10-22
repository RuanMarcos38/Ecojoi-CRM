-- Ecojoi CRM hardening and operational modules.
-- Safe to apply after 001_init.sql.

-- 1) Regular users must always be able to read their own profile so API context works.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select using (
  id = auth.uid()
  or (public.has_tenant_access(tenant_id) and public.has_permission('team.view'))
);

-- 2) Feature flags are safe metadata and must be readable by every user of the tenant.
drop policy if exists features_select on public.feature_flags;
create policy features_select on public.feature_flags
for select using (public.has_tenant_access(tenant_id));

-- 3) Centralized permission map including automation permissions.
create or replace function public.has_permission(permission_name text) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare r public.app_role;
begin
  r := public.current_app_role();
  if r is null then return false; end if;
  if r in ('super_admin','company_admin') then return true; end if;

  if r = 'manager' then
    return permission_name = any(array[
      'contacts.view','contacts.create','contacts.update','contacts.delete',
      'conversations.view','conversations.create','conversations.send','conversations.manage',
      'deals.view','deals.create','deals.update','deals.delete',
      'tasks.view','tasks.create','tasks.update','tasks.delete',
      'automations.view','automations.manage',
      'reports.view','team.view','settings.view'
    ]);
  end if;

  if r = 'user' then
    return permission_name = any(array[
      'contacts.view','contacts.create','contacts.update',
      'conversations.view','conversations.create','conversations.send',
      'deals.view','deals.create','deals.update',
      'tasks.view','tasks.create','tasks.update'
    ]);
  end if;
  return false;
end; $$;

-- Conversation creation is available to normal CRM users without granting full management rights.
drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
for insert with check (public.has_tenant_access(tenant_id) and public.has_permission('conversations.create'));

-- 4) Company settings.
create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  legal_name text,
  document text,
  phone text,
  email text,
  timezone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tenant_settings enable row level security;
create policy tenant_settings_select on public.tenant_settings
for select using (public.has_tenant_access(tenant_id) and public.has_permission('settings.view'));
create policy tenant_settings_write on public.tenant_settings
for all using (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

-- 5) Tenant-scoped automations. Execution workers must also scope by tenant_id.
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  trigger_type text not null check (trigger_type in ('lead_created','conversation_idle','deal_won','task_overdue')),
  action_type text not null check (action_type in ('create_task','notify_user','change_stage','internal_message')),
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automations_tenant_enabled_idx on public.automations(tenant_id,enabled);
alter table public.automations enable row level security;
create policy automations_select on public.automations
for select using (public.has_tenant_access(tenant_id) and public.has_permission('automations.view'));
create policy automations_insert on public.automations
for insert with check (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));
create policy automations_update on public.automations
for update using (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));
create policy automations_delete on public.automations
for delete using (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

-- 6) Audit logs are append-only through a SECURITY DEFINER RPC. Direct inserts are blocked.
drop policy if exists audit_insert on public.audit_logs;
create or replace function public.write_audit_log(
  p_action text,
  p_entity text,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid := public.current_tenant_id();
begin
  if v_user is null or v_tenant is null then
    raise exception 'unauthorized';
  end if;
  insert into public.audit_logs(tenant_id,user_id,action,entity,entity_id,metadata)
  values(v_tenant,v_user,p_action,p_entity,p_entity_id,coalesce(p_metadata,'{}'::jsonb));
end; $$;
revoke all on function public.write_audit_log(text,text,text,jsonb) from public;
grant execute on function public.write_audit_log(text,text,text,jsonb) to authenticated;

-- 7) First-user bootstrap. A user can bootstrap exactly once: only when no profile exists.
create or replace function public.bootstrap_tenant(
  p_company_name text,
  p_company_slug text,
  p_full_name text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if exists(select 1 from public.profiles where id=v_user) then raise exception 'profile_already_exists'; end if;
  if length(trim(p_company_name)) < 2 then raise exception 'invalid_company_name'; end if;
  if p_company_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'invalid_company_slug'; end if;
  if length(trim(p_full_name)) < 2 then raise exception 'invalid_full_name'; end if;

  insert into public.tenants(name,slug) values(trim(p_company_name),lower(trim(p_company_slug))) returning id into v_tenant;
  insert into public.profiles(id,tenant_id,full_name,role) values(v_user,v_tenant,trim(p_full_name),'company_admin');
  insert into public.tenant_settings(tenant_id) values(v_tenant);
  insert into public.feature_flags(tenant_id,feature_name,enabled) values
    (v_tenant,'atendimento',true),
    (v_tenant,'automacoes',true),
    (v_tenant,'relatorios',true),
    (v_tenant,'ai_agent',false),
    (v_tenant,'whatsapp',false),
    (v_tenant,'instagram',false),
    (v_tenant,'facebook',false)
  on conflict (tenant_id,feature_name) do nothing;
  return v_tenant;
end; $$;
revoke all on function public.bootstrap_tenant(text,text,text) from public;
grant execute on function public.bootstrap_tenant(text,text,text) to authenticated;

-- 8) Super Admin accounts cannot be created/downgraded/disabled by company-level administrators.
create or replace function public.protect_super_admin_profile() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_role public.app_role := public.current_app_role();
begin
  if (old.role='super_admin' or new.role='super_admin') and v_role is distinct from 'super_admin' then
    raise exception 'super_admin_profile_protected';
  end if;
  if old.id=auth.uid() and old.role='company_admin' and new.role is distinct from old.role then
    raise exception 'cannot_demote_self';
  end if;
  if old.id=auth.uid() and new.active=false then
    raise exception 'cannot_disable_self';
  end if;
  return new;
end; $$;
drop trigger if exists profiles_protect_super_admin on public.profiles;
create trigger profiles_protect_super_admin before update on public.profiles
for each row execute function public.protect_super_admin_profile();

-- 9) Extend cross-tenant foreign-key protection to every tenant-owned reference.
create or replace function public.validate_same_tenant() returns trigger language plpgsql as $$
begin
  if tg_table_name='contacts' then
    if new.created_by is not null and not exists(select 1 from public.profiles p where p.id=new.created_by and p.tenant_id=new.tenant_id) then raise exception 'cross-tenant contact creator reference'; end if;
  elsif tg_table_name='conversations' then
    if not exists(select 1 from public.contacts c where c.id=new.contact_id and c.tenant_id=new.tenant_id) then raise exception 'cross-tenant contact reference'; end if;
    if new.assigned_to is not null and not exists(select 1 from public.profiles p where p.id=new.assigned_to and p.tenant_id=new.tenant_id) then raise exception 'cross-tenant assignee reference'; end if;
  elsif tg_table_name='messages' then
    if not exists(select 1 from public.conversations c where c.id=new.conversation_id and c.tenant_id=new.tenant_id) then raise exception 'cross-tenant conversation reference'; end if;
    if new.sender_user_id is not null and not exists(select 1 from public.profiles p where p.id=new.sender_user_id and p.tenant_id=new.tenant_id) then raise exception 'cross-tenant sender reference'; end if;
  elsif tg_table_name='deals' then
    if new.contact_id is not null and not exists(select 1 from public.contacts c where c.id=new.contact_id and c.tenant_id=new.tenant_id) then raise exception 'cross-tenant deal contact reference'; end if;
    if new.owner_id is not null and not exists(select 1 from public.profiles p where p.id=new.owner_id and p.tenant_id=new.tenant_id) then raise exception 'cross-tenant deal owner reference'; end if;
  elsif tg_table_name='tasks' then
    if new.related_contact_id is not null and not exists(select 1 from public.contacts c where c.id=new.related_contact_id and c.tenant_id=new.tenant_id) then raise exception 'cross-tenant task contact reference'; end if;
    if new.assigned_to is not null and not exists(select 1 from public.profiles p where p.id=new.assigned_to and p.tenant_id=new.tenant_id) then raise exception 'cross-tenant task assignee reference'; end if;
    if new.created_by is not null and not exists(select 1 from public.profiles p where p.id=new.created_by and p.tenant_id=new.tenant_id) then raise exception 'cross-tenant task creator reference'; end if;
  elsif tg_table_name='automations' then
    if new.created_by is not null and not exists(select 1 from public.profiles p where p.id=new.created_by and p.tenant_id=new.tenant_id) then raise exception 'cross-tenant automation creator reference'; end if;
  end if;
  return new;
end; $$;

drop trigger if exists contacts_same_tenant on public.contacts;
create trigger contacts_same_tenant before insert or update on public.contacts for each row execute function public.validate_same_tenant();
drop trigger if exists automations_same_tenant on public.automations;
create trigger automations_same_tenant before insert or update on public.automations for each row execute function public.validate_same_tenant();
