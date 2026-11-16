begin;

create table public.custom_pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 100),
  stages jsonb not null check (jsonb_typeof(stages) = 'array' and jsonb_array_length(stages) between 1 and 30)
);
create unique index custom_pipelines_tenant_name on public.custom_pipelines (tenant_id, lower(trim(name)));
alter table public.custom_pipelines enable row level security;
revoke all on public.custom_pipelines from public, anon, authenticated;
grant select, insert on public.custom_pipelines to authenticated;
create policy custom_pipelines_read on public.custom_pipelines for select to authenticated
  using (public.has_tenant_access(tenant_id) and public.has_permission('deals.view'));
create policy custom_pipelines_create on public.custom_pipelines for insert to authenticated
  with check (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

-- Legacy stages keep their identifiers. Custom stage identifiers are unique to a funnel.
create function public.validate_custom_pipeline_stage() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare
  target_pipeline uuid;
  previous_pipeline uuid;
begin
  if new.stage not in ('new','qualification','proposal','closing','won','lost') then
    select p.id into target_pipeline from public.custom_pipelines p
      where p.tenant_id = new.tenant_id and p.stages @> jsonb_build_array(jsonb_build_object('id', new.stage));
    if target_pipeline is null then
      raise exception 'Invalid funnel stage' using errcode = '23514';
    end if;
  end if;
  if tg_table_name = 'deals' and tg_op = 'UPDATE' then
    select p.id into previous_pipeline from public.custom_pipelines p
      where p.tenant_id = old.tenant_id and p.stages @> jsonb_build_array(jsonb_build_object('id', old.stage));
    if previous_pipeline is distinct from target_pipeline then
      raise exception 'The stage belongs to a different funnel' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_custom_pipeline_stage() from public;
alter table public.pipeline_message_rules drop constraint if exists pipeline_message_rules_stage_check;
create trigger validate_custom_deal_stage before insert or update of stage on public.deals
  for each row execute function public.validate_custom_pipeline_stage();
create trigger validate_custom_rule_stage before insert or update of stage on public.pipeline_message_rules
  for each row execute function public.validate_custom_pipeline_stage();

commit;
