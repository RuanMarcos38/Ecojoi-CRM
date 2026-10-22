-- Ecojoi CRM - indices relacionais e initplan de RLS.
create index if not exists audit_logs_user_id_fk_idx on public.audit_logs(user_id);
create index if not exists automations_created_by_fk_idx on public.automations(created_by);
create index if not exists conversations_assigned_to_fk_idx on public.conversations(assigned_to);
create index if not exists conversations_contact_id_fk_idx on public.conversations(contact_id);
create index if not exists deals_contact_id_fk_idx on public.deals(contact_id);
create index if not exists deals_owner_id_fk_idx on public.deals(owner_id);
create index if not exists messages_conversation_id_fk_idx on public.messages(conversation_id);
create index if not exists messages_sender_user_id_fk_idx on public.messages(sender_user_id);
create index if not exists n8n_execution_logs_conversation_id_fk_idx on public.n8n_execution_logs(conversation_id);
create index if not exists pipeline_automation_runs_deal_id_fk_idx on public.pipeline_automation_runs(deal_id);
create index if not exists pipeline_automation_runs_message_id_fk_idx on public.pipeline_automation_runs(message_id);
create index if not exists pipeline_message_rules_created_by_fk_idx on public.pipeline_message_rules(created_by);
create index if not exists tasks_assigned_to_fk_idx on public.tasks(assigned_to);
create index if not exists tasks_created_by_fk_idx on public.tasks(created_by);
create index if not exists tasks_related_contact_id_fk_idx on public.tasks(related_contact_id);
create index if not exists webhook_subscriptions_tenant_id_fk_idx on public.webhook_subscriptions(tenant_id);
create index if not exists contacts_created_by_fk_idx on public.contacts(created_by);
create index if not exists contacts_organization_id_fk_idx on public.contacts(organization_id);

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
using (
  public.has_tenant_access(tenant_id)
  and (user_id is null or user_id=(select auth.uid()))
);

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update
using (
  public.has_tenant_access(tenant_id)
  and (user_id is null or user_id=(select auth.uid()))
)
with check (
  public.has_tenant_access(tenant_id)
  and (user_id is null or user_id=(select auth.uid()))
);

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
using (
  id=(select auth.uid())
  or (public.has_tenant_access(tenant_id) and public.has_permission('team.view'))
);
