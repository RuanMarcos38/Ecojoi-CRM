-- ECOJOI CRM - somente a sessao de login mais recente pode acessar dados.
-- A consulta usa auth.sessions e o session_id do JWT autenticado.
-- Nao exclui sessoes nem modifica dados dos usuarios; revogacao logica imediata.
create or replace function public.is_latest_crm_session()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce((
    select s.id = (
      select newest.id
      from auth.sessions newest
      where newest.user_id = (select auth.uid())
      order by newest.created_at desc, newest.id desc
      limit 1
    )
    from auth.sessions s
    where s.user_id = (select auth.uid())
      and s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
      and (s.not_after is null or s.not_after > now())
  ), false);
$$;

revoke all on function public.is_latest_crm_session() from public, anon;
grant execute on function public.is_latest_crm_session() to authenticated;

-- A regra vale inclusive para acesso direto via API de dados do Supabase.
-- Preserva a regra multiempresa e o acesso especial do superadministrador,
-- porem nenhum papel pode ultrapassar a regra de sessao unica.
create or replace function public.has_tenant_access(target uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select public.is_latest_crm_session()
    and (
      public.current_app_role() = 'super_admin'
      or public.current_tenant_id() = target
    );
$$;
