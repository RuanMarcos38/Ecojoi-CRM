alter table public.messages add column if not exists reply_to_provider_id text;

comment on column public.messages.reply_to_provider_id is
  'Identificador Meta da mensagem citada dentro da mesma conversa WhatsApp.';
