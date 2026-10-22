-- Ecojoi CRM - filas do modo Atendimento.
-- Mantem a estrutura existente de conversations e acrescenta somente o estado operacional da fila.

alter table public.conversations
  add column attendance_state text not null default 'waiting';

alter table public.conversations
  add column attendance_changed_at timestamptz not null default now();

alter table public.conversations
  add constraint conversations_attendance_state_check
  check (attendance_state in ('waiting','in_service','automatic'));

-- Conversas que ja estavam atribuidas a uma pessoa continuam em atendimento humano.
update public.conversations
set attendance_state = case when assigned_to is null then 'waiting' else 'in_service' end,
    attendance_changed_at = now();

create index conversations_tenant_attendance_idx
  on public.conversations(tenant_id, attendance_state, updated_at desc);

-- Um usuario operacional do CRM pode assumir, devolver ou encaminhar uma conversa
-- para o agente automatico. Isso continua limitado ao tenant pelo RLS.
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
      'conversations.view','conversations.create','conversations.send','conversations.manage',
      'deals.view','deals.create','deals.update',
      'tasks.view','tasks.create','tasks.update'
    ]);
  end if;
  return false;
end; $$;

-- Mesmo com conversations.manage, exclusao de conversa fica reservada a perfis de gestao.
drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations
for delete using (
  public.has_tenant_access(tenant_id)
  and public.current_app_role() in ('super_admin','company_admin','manager')
);
