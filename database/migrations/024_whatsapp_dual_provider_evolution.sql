-- Ecojoi CRM - seleção segura de provedor WhatsApp (Meta Cloud API ou Evolution API).
-- Mudança aditiva: preserva Meta como padrão e não armazena API keys do Evolution no banco.

alter table public.tenant_settings
  add column if not exists whatsapp_provider text not null default 'meta';

alter table public.tenant_settings
  add column if not exists evolution_instance_name text;

do $$ begin
  alter table public.tenant_settings
    add constraint tenant_settings_whatsapp_provider_check
    check (whatsapp_provider in ('meta','evolution'));
exception when duplicate_object then null; end $$;

create unique index if not exists tenant_settings_evolution_instance_uidx
  on public.tenant_settings(evolution_instance_name)
  where evolution_instance_name is not null;

comment on column public.tenant_settings.whatsapp_provider is
  'Provedor ativo do canal WhatsApp: meta para Cloud API oficial ou evolution para conexão via QR Code.';

comment on column public.tenant_settings.evolution_instance_name is
  'Nome da instância Evolution API. URL e API key permanecem somente nas variáveis de ambiente do servidor.';
