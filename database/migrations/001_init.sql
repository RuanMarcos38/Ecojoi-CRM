create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin','company_admin','manager','user');
create type public.contact_status as enum ('lead','active','inactive');
create type public.conversation_status as enum ('open','pending','closed');
create type public.message_direction as enum ('inbound','outbound','system');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  full_name text not null,
  role public.app_role not null default 'user',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_tenant_idx on public.profiles(tenant_id);

create or replace function public.current_tenant_id() returns uuid
language sql stable security definer set search_path=public as $$
  select tenant_id from public.profiles where id = auth.uid() and active = true limit 1;
$$;

create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path=public as $$
  select role from public.profiles where id = auth.uid() and active = true limit 1;
$$;

create or replace function public.has_tenant_access(target uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.current_app_role() = 'super_admin' or public.current_tenant_id() = target;
$$;

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
      'conversations.view','conversations.send','conversations.manage',
      'deals.view','deals.create','deals.update','deals.delete',
      'tasks.view','tasks.create','tasks.update','tasks.delete',
      'reports.view','team.view','settings.view'
    ]);
  end if;

  if r = 'user' then
    return permission_name = any(array[
      'contacts.view','contacts.create','contacts.update',
      'conversations.view','conversations.send',
      'deals.view','deals.create','deals.update',
      'tasks.view','tasks.create','tasks.update'
    ]);
  end if;
  return false;
end; $$;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  source text,
  status public.contact_status not null default 'lead',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_tenant_idx on public.contacts(tenant_id);
create index contacts_tenant_email_idx on public.contacts(tenant_id,email);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null default 'internal' check (channel in ('internal','whatsapp','instagram','facebook','email')),
  status public.conversation_status not null default 'open',
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_tenant_idx on public.conversations(tenant_id);
create index conversations_contact_idx on public.conversations(tenant_id,contact_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction public.message_direction not null,
  body text not null,
  status text not null default 'sent',
  sender_user_id uuid references public.profiles(id),
  provider_message_id text,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages(tenant_id,conversation_id,created_at);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  stage text not null default 'new',
  value numeric(14,2) not null default 0,
  probability int not null default 10 check(probability between 0 and 100),
  owner_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deals_tenant_stage_idx on public.deals(tenant_id,stage);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'pending',
  priority text not null default 'medium',
  assigned_to uuid references public.profiles(id),
  related_contact_id uuid references public.contacts(id) on delete set null,
  due_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_tenant_due_idx on public.tasks(tenant_id,due_at);

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_name text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,feature_name)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_tenant_created_idx on public.audit_logs(tenant_id,created_at desc);

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.deals enable row level security;
alter table public.tasks enable row level security;
alter table public.feature_flags enable row level security;
alter table public.audit_logs enable row level security;

create policy tenants_select on public.tenants for select using (public.has_tenant_access(id));
create policy tenants_update on public.tenants for update using (public.has_tenant_access(id) and public.has_permission('settings.manage')) with check (public.has_tenant_access(id) and public.has_permission('settings.manage'));

create policy profiles_select on public.profiles for select using (public.has_tenant_access(tenant_id) and public.has_permission('team.view'));
create policy profiles_update on public.profiles for update using (public.has_tenant_access(tenant_id) and public.has_permission('team.manage')) with check (public.has_tenant_access(tenant_id) and public.has_permission('team.manage'));

create policy contacts_select on public.contacts for select using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.view'));
create policy contacts_insert on public.contacts for insert with check (public.has_tenant_access(tenant_id) and public.has_permission('contacts.create'));
create policy contacts_update on public.contacts for update using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update')) with check (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));
create policy contacts_delete on public.contacts for delete using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.delete'));

create policy conversations_select on public.conversations for select using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.view'));
create policy conversations_insert on public.conversations for insert with check (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));
create policy conversations_update on public.conversations for update using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage')) with check (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));
create policy conversations_delete on public.conversations for delete using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));

create policy messages_select on public.messages for select using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.view'));
create policy messages_insert on public.messages for insert with check (public.has_tenant_access(tenant_id) and public.has_permission('conversations.send'));
create policy messages_update on public.messages for update using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage')) with check (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));

create policy deals_select on public.deals for select using (public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));
create policy deals_insert on public.deals for insert with check (public.has_tenant_access(tenant_id) and public.has_permission('deals.create'));
create policy deals_update on public.deals for update using (public.has_tenant_access(tenant_id) and public.has_permission('deals.update')) with check (public.has_tenant_access(tenant_id) and public.has_permission('deals.update'));
create policy deals_delete on public.deals for delete using (public.has_tenant_access(tenant_id) and public.has_permission('deals.delete'));

create policy tasks_select on public.tasks for select using (public.has_tenant_access(tenant_id) and public.has_permission('tasks.view'));
create policy tasks_insert on public.tasks for insert with check (public.has_tenant_access(tenant_id) and public.has_permission('tasks.create'));
create policy tasks_update on public.tasks for update using (public.has_tenant_access(tenant_id) and public.has_permission('tasks.update')) with check (public.has_tenant_access(tenant_id) and public.has_permission('tasks.update'));
create policy tasks_delete on public.tasks for delete using (public.has_tenant_access(tenant_id) and public.has_permission('tasks.delete'));

create policy features_select on public.feature_flags for select using (public.has_tenant_access(tenant_id) and public.has_permission('settings.view'));
create policy features_write on public.feature_flags for all using (public.has_tenant_access(tenant_id) and public.has_permission('features.manage')) with check (public.has_tenant_access(tenant_id) and public.has_permission('features.manage'));

create policy audit_select on public.audit_logs for select using (public.has_tenant_access(tenant_id) and public.has_permission('audit.view'));
create policy audit_insert on public.audit_logs for insert with check (public.has_tenant_access(tenant_id));

create or replace function public.validate_same_tenant() returns trigger language plpgsql as $$
begin
  if tg_table_name='conversations' then
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
  end if;
  return new;
end; $$;

create trigger conversations_same_tenant before insert or update on public.conversations for each row execute function public.validate_same_tenant();
create trigger messages_same_tenant before insert or update on public.messages for each row execute function public.validate_same_tenant();
create trigger deals_same_tenant before insert or update on public.deals for each row execute function public.validate_same_tenant();
create trigger tasks_same_tenant before insert or update on public.tasks for each row execute function public.validate_same_tenant();
