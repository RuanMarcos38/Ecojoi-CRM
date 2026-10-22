-- Ecojoi CRM - integração n8n para automações e agente IA.
-- Aditivo: não substitui credenciais existentes nem remove estruturas.

alter table public.tenant_settings
  add column if not exists n8n_ai_enabled boolean not null default false;

alter table public.tenant_settings
  add column if not exists n8n_webhook_url text;

alter table public.tenant_settings
  add column if not exists n8n_workflow_id text;

comment on column public.tenant_settings.n8n_ai_enabled is
  'Habilita envio de eventos do atendimento ao webhook n8n configurado para o tenant.';

comment on column public.tenant_settings.n8n_webhook_url is
  'URL do webhook n8n do agente IA. Tokens permanecem somente no servidor.';

comment on column public.tenant_settings.n8n_workflow_id is
  'ID do último workflow importado pelo CRM para a instância n8n configurada.';
