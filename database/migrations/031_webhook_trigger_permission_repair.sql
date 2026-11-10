-- ECOJOI CRM: reparar falha de todos os gatilhos de webhook nos fluxos de CRUD.
-- Os logs de 10/11/2026 indicaram: permission denied for function queue_webhook_event.
-- A fila continua restrita a administradores do banco (sem grant ao usuário final).
-- Somente os gatilhos internos passam a executar com o privilégio de seu proprietário.
ALTER FUNCTION public.webhook_event_contact_insert() SECURITY DEFINER;
ALTER FUNCTION public.webhook_event_contact_update() SECURITY DEFINER;
ALTER FUNCTION public.webhook_event_deal_insert() SECURITY DEFINER;
ALTER FUNCTION public.webhook_event_deal_won() SECURITY DEFINER;
ALTER FUNCTION public.webhook_event_task_insert() SECURITY DEFINER;

-- Evita resolução de objetos em schemas temporários controlados pelo usuário.
ALTER FUNCTION public.webhook_event_contact_insert() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.webhook_event_contact_update() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.webhook_event_deal_insert() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.webhook_event_deal_won() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.webhook_event_task_insert() SET search_path = pg_catalog, public, pg_temp;
