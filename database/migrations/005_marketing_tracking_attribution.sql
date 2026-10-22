-- Ecojoi CRM - configuracao de tracking e atribuicao de origem dos leads.
-- Alteracao aditiva: nao remove nem renomeia estruturas existentes.

alter table public.tenant_settings
  add column if not exists meta_pixel_id text;

alter table public.tenant_settings
  add column if not exists google_analytics_id text;

alter table public.contacts
  add column if not exists attribution jsonb not null default '{}'::jsonb;

comment on column public.tenant_settings.meta_pixel_id is
  'ID publico do Meta Pixel configurado pela empresa.';

comment on column public.tenant_settings.google_analytics_id is
  'Measurement ID publico do Google Analytics configurado pela empresa.';

comment on column public.contacts.attribution is
  'Atribuicao de marketing do lead: UTM, landing page, referrer, gclid e fbclid.';
