begin;
-- Reuse existing pipelines and pipeline_stages_v2; preserve the six legacy automation/report categories.
alter table public.pipeline_stages_v2 add column if not exists active boolean not null default true,
 add column if not exists semantic_stage text;
update public.pipeline_stages_v2 set semantic_stage=case when is_won then 'won' when is_lost then 'lost'
 when stage_key in ('new','qualification','proposal','closing','won','lost') then stage_key else 'qualification' end where semantic_stage is null;
alter table public.pipeline_stages_v2 alter column semantic_stage set default 'qualification',alter column semantic_stage set not null;
alter table public.pipeline_stages_v2 drop constraint if exists pipeline_stages_semantic_check;
alter table public.pipeline_stages_v2 add constraint pipeline_stages_semantic_check check(semantic_stage in ('new','qualification','proposal','closing','won','lost'));
create or replace function public.crm_guard_pipeline_stage()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='DELETE' or (old.active and not new.active) then
  if exists(select 1 from public.deals where tenant_id=old.tenant_id and
   (pipeline_stage_id=old.id or(pipeline_stage_id is null and stage=old.stage_key and
    (pipeline_id=old.pipeline_id or(pipeline_id is null and exists(select 1 from public.pipelines where id=old.pipeline_id and is_default))))))
  then raise exception 'pipeline_stage_in_use';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;
$$;
create or replace function public.crm_bind_deal_stage()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.pipeline_stages_v2%rowtype;
begin
 if new.pipeline_stage_id is not null then
  select * into s from public.pipeline_stages_v2 where id=new.pipeline_stage_id and tenant_id=new.tenant_id and active for share;
  if not found then raise exception 'pipeline_stage_invalid';end if;
  new.pipeline_id:=s.pipeline_id;new.stage:=s.semantic_stage;
  if tg_op='INSERT' then
   new.probability:=coalesce(new.probability,s.probability);new.stage_changed_at:=now();
  elsif new.pipeline_stage_id is distinct from old.pipeline_stage_id then
   new.probability:=s.probability;new.stage_changed_at:=now();
  end if;
 end if;return new;
end;
$$;
revoke all on function public.crm_guard_pipeline_stage() from public,anon,authenticated;
revoke all on function public.crm_bind_deal_stage() from public,anon,authenticated;
drop trigger if exists pipeline_stages_guard_retirement on public.pipeline_stages_v2;
create trigger pipeline_stages_guard_retirement before update of active or delete on public.pipeline_stages_v2 for each row execute function public.crm_guard_pipeline_stage();
drop trigger if exists deals_bind_pipeline_stage on public.deals;
create trigger deals_bind_pipeline_stage before insert or update of pipeline_stage_id,tenant_id on public.deals for each row execute function public.crm_bind_deal_stage();
commit;

