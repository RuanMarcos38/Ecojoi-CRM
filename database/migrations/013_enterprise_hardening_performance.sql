-- Ecojoi CRM - hardening/performance da fundacao enterprise.
create schema if not exists extensions;

do $$
begin
  if exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid=e.extnamespace
    where e.extname='pg_trgm' and n.nspname='public'
  ) then
    alter extension pg_trgm set schema extensions;
  end if;
end $$;

create index if not exists ai_knowledge_created_by_idx on public.ai_knowledge_documents(created_by) where created_by is not null;
create index if not exists contact_tags_tag_id_idx on public.contact_tags(tag_id);
create index if not exists contacts_created_by_idx on public.contacts(created_by) where created_by is not null;
create index if not exists contacts_organization_id_only_idx on public.contacts(organization_id) where organization_id is not null;
create index if not exists n8n_versions_imported_by_idx on public.n8n_workflow_versions(imported_by) where imported_by is not null;
create index if not exists notifications_user_id_idx on public.notifications(user_id) where user_id is not null;
create index if not exists outbound_queue_conversation_id_idx on public.outbound_message_queue(conversation_id);
create index if not exists outbound_queue_message_id_idx on public.outbound_message_queue(message_id) where message_id is not null;
create index if not exists quick_replies_created_by_idx on public.quick_replies(created_by) where created_by is not null;
create index if not exists sales_goals_user_id_idx on public.sales_goals(user_id) where user_id is not null;
create index if not exists webhook_deliveries_subscription_id_idx on public.webhook_deliveries(subscription_id);

drop policy if exists organizations_write on public.organizations;
drop policy if exists organizations_insert on public.organizations;
drop policy if exists organizations_update on public.organizations;
drop policy if exists organizations_delete on public.organizations;
create policy organizations_insert on public.organizations for insert
with check (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));
create policy organizations_update on public.organizations for update
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));
create policy organizations_delete on public.organizations for delete
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));

drop policy if exists tags_write on public.tags;
drop policy if exists tags_insert on public.tags;
drop policy if exists tags_update on public.tags;
drop policy if exists tags_delete on public.tags;
create policy tags_insert on public.tags for insert
with check (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));
create policy tags_update on public.tags for update
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));
create policy tags_delete on public.tags for delete
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));

drop policy if exists contact_tags_write on public.contact_tags;
drop policy if exists contact_tags_insert on public.contact_tags;
drop policy if exists contact_tags_delete on public.contact_tags;
create policy contact_tags_insert on public.contact_tags for insert
with check (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));
create policy contact_tags_delete on public.contact_tags for delete
using (public.has_tenant_access(tenant_id) and public.has_permission('contacts.update'));

drop policy if exists quick_replies_write on public.quick_replies;
drop policy if exists quick_replies_insert on public.quick_replies;
drop policy if exists quick_replies_update on public.quick_replies;
drop policy if exists quick_replies_delete on public.quick_replies;
create policy quick_replies_insert on public.quick_replies for insert
with check (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));
create policy quick_replies_update on public.quick_replies for update
using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));
create policy quick_replies_delete on public.quick_replies for delete
using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));

drop policy if exists whatsapp_templates_write on public.whatsapp_templates;
drop policy if exists whatsapp_templates_insert on public.whatsapp_templates;
drop policy if exists whatsapp_templates_update on public.whatsapp_templates;
drop policy if exists whatsapp_templates_delete on public.whatsapp_templates;
create policy whatsapp_templates_insert on public.whatsapp_templates for insert
with check (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));
create policy whatsapp_templates_update on public.whatsapp_templates for update
using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));
create policy whatsapp_templates_delete on public.whatsapp_templates for delete
using (public.has_tenant_access(tenant_id) and public.has_permission('conversations.manage'));

drop policy if exists webhook_subscriptions_write on public.webhook_subscriptions;
drop policy if exists webhook_subscriptions_insert on public.webhook_subscriptions;
drop policy if exists webhook_subscriptions_update on public.webhook_subscriptions;
drop policy if exists webhook_subscriptions_delete on public.webhook_subscriptions;
create policy webhook_subscriptions_insert on public.webhook_subscriptions for insert
with check (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));
create policy webhook_subscriptions_update on public.webhook_subscriptions for update
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));
create policy webhook_subscriptions_delete on public.webhook_subscriptions for delete
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

drop policy if exists n8n_versions_write on public.n8n_workflow_versions;
drop policy if exists n8n_versions_insert on public.n8n_workflow_versions;
drop policy if exists n8n_versions_delete on public.n8n_workflow_versions;
create policy n8n_versions_insert on public.n8n_workflow_versions for insert
with check (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));
create policy n8n_versions_delete on public.n8n_workflow_versions for delete
using (public.has_tenant_access(tenant_id) and public.has_permission('automations.manage'));

drop policy if exists knowledge_write on public.ai_knowledge_documents;
drop policy if exists knowledge_insert on public.ai_knowledge_documents;
drop policy if exists knowledge_update on public.ai_knowledge_documents;
drop policy if exists knowledge_delete on public.ai_knowledge_documents;
create policy knowledge_insert on public.ai_knowledge_documents for insert
with check (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));
create policy knowledge_update on public.ai_knowledge_documents for update
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));
create policy knowledge_delete on public.ai_knowledge_documents for delete
using (public.has_tenant_access(tenant_id) and public.has_permission('settings.manage'));

drop policy if exists goals_write on public.sales_goals;
drop policy if exists goals_insert on public.sales_goals;
drop policy if exists goals_update on public.sales_goals;
drop policy if exists goals_delete on public.sales_goals;
create policy goals_insert on public.sales_goals for insert
with check (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'));
create policy goals_update on public.sales_goals for update
using (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'))
with check (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'));
create policy goals_delete on public.sales_goals for delete
using (public.has_tenant_access(tenant_id) and public.has_permission('reports.view'));
