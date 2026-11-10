-- ============================================================================
-- Aurora Sales: turn on the automatic follow-up schedule (every 15 minutes).
-- Run this AFTER the server functions are deployed (see aurora-sales/README.md).
--
-- Before you run it, replace the two placeholders below:
--   YOUR-PROJECT-REF  → the part before ".supabase.co" in your Project URL
--   YOUR-CRON-SECRET  → the same CRON_SECRET you saved in the function secrets
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove an older copy of the schedule, if there is one.
select cron.unschedule(jobid) from cron.job where jobname = 'aurora-sales-followups';

select cron.schedule(
  'aurora-sales-followups',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/sales-cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', 'YOUR-CRON-SECRET'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

-- Done! To check it later: select * from cron.job_run_details order by start_time desc limit 5;
