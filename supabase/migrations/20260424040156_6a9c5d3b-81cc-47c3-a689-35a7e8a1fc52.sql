DO $$
BEGIN
  PERFORM cron.unschedule('erp-auto-sync-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('erp-auto-sync-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'erp-auto-sync-hourly',
  '0 * * * *',
  $cron$
    SELECT net.http_post(
      url     := 'https://gqczgatkouxjdcyxnubf.supabase.co/functions/v1/erp-integration',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := '{"action":"auto_sync"}'::jsonb,
      timeout_milliseconds := 300000
    ) AS request_id;
  $cron$
);