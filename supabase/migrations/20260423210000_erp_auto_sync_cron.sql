-- Daily cron: ERP auto-sync (SGA / sincronismo) at 06:00 BRT = 09:00 UTC
-- Calls the public edge function erp-integration with {action:'auto_sync'}
-- The edge iterates clients.auto_sync_enabled=true and pulls from each client's API.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('erp-auto-sync-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'erp-auto-sync-daily',
  '0 9 * * *',
  $cron$
    SELECT net.http_post(
      url     := 'https://gqczgatkouxjdcyxnubf.supabase.co/functions/v1/erp-integration',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := '{"action":"auto_sync"}'::jsonb,
      timeout_milliseconds := 300000
    ) AS request_id;
  $cron$
);
