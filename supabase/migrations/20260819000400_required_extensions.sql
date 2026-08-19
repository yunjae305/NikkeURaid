-- The scheduler lives in Supabase: pg_cron triggers pg_net, which invokes the
-- collector Edge Function. Enabling both here keeps local and hosted schemas aligned.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
