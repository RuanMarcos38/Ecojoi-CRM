-- ECOJOI CRM - 2026-11-06
-- Fix 42501 permission denied for function queue_webhook_event during
-- authenticated inserts into messages.
-- Queue helper intentionally remains EXECUTE-restricted to service_role/postgres.
-- Only the trusted trigger executes with its postgres owner's rights;
-- message RLS and cross-tenant validation remain unchanged.
ALTER FUNCTION public.webhook_event_message_insert() SECURITY DEFINER;
ALTER FUNCTION public.webhook_event_message_insert() SET search_path = pg_catalog, public;

-- Rollback if ever required (restores the original invoker behavior,
-- but also reinstates the HTTP 500 for authenticated sends):
-- ALTER FUNCTION public.webhook_event_message_insert() SECURITY INVOKER;
