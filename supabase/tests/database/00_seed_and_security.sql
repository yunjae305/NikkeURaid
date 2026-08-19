begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

select ok(
  exists(select 1 from pg_catalog.pg_extension where extname = 'pg_cron'),
  'pg_cron is enabled for the dispatcher schedule'
);

select ok(
  exists(select 1 from pg_catalog.pg_extension where extname = 'pg_net'),
  'pg_net is enabled for Edge Function delivery'
);

select is((select count(*)::int from public.nikkes), 196, 'nikkes seed has 196 rows');
select is((select count(*)::int from public.season_bosses), 45, 'season boss seed has 45 rows');
select is((select count(*)::int from public.season_coef), 5, 'season coefficient seed has 5 rows');

select ok(
  (
    select count(*) = 10 and bool_and(c.relrowsecurity)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array[
        'areas', 'guilds', 'nikkes', 'members', 'attacks',
        'boss_levels', 'season_bosses', 'season_coef',
        'auth_session', 'sync_log'
      ])
  ),
  'RLS is enabled on all ten tables'
);

select ok(
  (
    select count(*) = 8
       and bool_and(cmd = 'SELECT')
       and bool_and(roles @> array['anon', 'authenticated']::name[])
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'areas', 'guilds', 'nikkes', 'members', 'attacks',
        'boss_levels', 'season_bosses', 'season_coef'
      ])
  ),
  'all public-read tables have anon/authenticated SELECT policies'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(array['auth_session', 'sync_log'])
  ),
  0,
  'service-only tables have no API RLS policy'
);

select ok(
  (
    select count(*) = 7
       and bool_and(coalesce(c.reloptions, array[]::text[]) @> array['security_invoker=true'])
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array[
        'v_member_daily', 'v_participation', 'v_season_totals',
        'v_combo_stats', 'v_nikke_usage', 'v_member_growth', 'v_sync_queue'
      ])
  ),
  'all seven views use security_invoker'
);

select ok(
  (
    select count(*) = 8
       and bool_and(pg_catalog.has_table_privilege('anon', 'public.' || name, 'SELECT'))
    from unnest(array[
      'areas', 'guilds', 'nikkes', 'members', 'attacks',
      'boss_levels', 'season_bosses', 'season_coef'
    ]) as r(name)
  ),
  'anon can select every public-read table'
);

select ok(
  (
    select count(*) = 8
       and bool_and(pg_catalog.has_table_privilege('authenticated', 'public.' || name, 'SELECT'))
    from unnest(array[
      'areas', 'guilds', 'nikkes', 'members', 'attacks',
      'boss_levels', 'season_bosses', 'season_coef'
    ]) as r(name)
  ),
  'authenticated can select every public-read table'
);

select ok(
  (
    select count(*) = 8 and bool_and(
      not pg_catalog.has_table_privilege('anon', 'public.' || name, 'INSERT')
      and not pg_catalog.has_table_privilege('anon', 'public.' || name, 'UPDATE')
      and not pg_catalog.has_table_privilege('anon', 'public.' || name, 'DELETE')
    )
    from unnest(array[
      'areas', 'guilds', 'nikkes', 'members', 'attacks',
      'boss_levels', 'season_bosses', 'season_coef'
    ]) as r(name)
  ),
  'anon cannot mutate public-read tables'
);

select ok(
  (
    select count(*) = 8 and bool_and(
      not pg_catalog.has_table_privilege('authenticated', 'public.' || name, 'INSERT')
      and not pg_catalog.has_table_privilege('authenticated', 'public.' || name, 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', 'public.' || name, 'DELETE')
    )
    from unnest(array[
      'areas', 'guilds', 'nikkes', 'members', 'attacks',
      'boss_levels', 'season_bosses', 'season_coef'
    ]) as r(name)
  ),
  'authenticated cannot mutate public-read tables'
);

select ok(
  (
    select count(*) = 6
       and bool_and(pg_catalog.has_table_privilege('anon', 'public.' || name, 'SELECT'))
    from unnest(array[
      'v_member_daily', 'v_participation', 'v_season_totals',
      'v_combo_stats', 'v_nikke_usage', 'v_member_growth'
    ]) as r(name)
  ),
  'anon can select all six public analytics views'
);

select ok(
  (
    select count(*) = 6
       and bool_and(pg_catalog.has_table_privilege('authenticated', 'public.' || name, 'SELECT'))
    from unnest(array[
      'v_member_daily', 'v_participation', 'v_season_totals',
      'v_combo_stats', 'v_nikke_usage', 'v_member_growth'
    ]) as r(name)
  ),
  'authenticated can select all six public analytics views'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.v_sync_queue', 'SELECT'),
  'anon cannot read the sync queue'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.v_sync_queue', 'SELECT'),
  'authenticated cannot read the sync queue'
);

select ok(
  (
    select count(*) = 7
       and bool_and(pg_catalog.has_table_privilege('service_role', 'public.' || name, 'SELECT'))
    from unnest(array[
      'v_member_daily', 'v_participation', 'v_season_totals',
      'v_combo_stats', 'v_nikke_usage', 'v_member_growth', 'v_sync_queue'
    ]) as r(name)
  ),
  'service_role can select all seven views'
);

select ok(
  (
    select count(*) = 7 and bool_and(
      not pg_catalog.has_table_privilege('service_role', 'public.' || name, 'INSERT')
      and not pg_catalog.has_table_privilege('service_role', 'public.' || name, 'UPDATE')
      and not pg_catalog.has_table_privilege('service_role', 'public.' || name, 'DELETE')
    )
    from unnest(array[
      'v_member_daily', 'v_participation', 'v_season_totals',
      'v_combo_stats', 'v_nikke_usage', 'v_member_growth', 'v_sync_queue'
    ]) as r(name)
  ),
  'service_role has read-only privileges on all seven views'
);

select ok(
  (
    select count(*) = 2 and bool_and(
      not pg_catalog.has_table_privilege('anon', 'public.' || name, 'SELECT')
      and not pg_catalog.has_table_privilege('anon', 'public.' || name, 'INSERT')
      and not pg_catalog.has_table_privilege('anon', 'public.' || name, 'UPDATE')
      and not pg_catalog.has_table_privilege('anon', 'public.' || name, 'DELETE')
    )
    from unnest(array['auth_session', 'sync_log']) as r(name)
  ),
  'anon has no privileges on collector state tables'
);

select ok(
  (
    select count(*) = 2 and bool_and(
      not pg_catalog.has_table_privilege('authenticated', 'public.' || name, 'SELECT')
      and not pg_catalog.has_table_privilege('authenticated', 'public.' || name, 'INSERT')
      and not pg_catalog.has_table_privilege('authenticated', 'public.' || name, 'UPDATE')
      and not pg_catalog.has_table_privilege('authenticated', 'public.' || name, 'DELETE')
    )
    from unnest(array['auth_session', 'sync_log']) as r(name)
  ),
  'authenticated has no privileges on collector state tables'
);

select ok(
  (
    select count(*) = 10 and bool_and(
      pg_catalog.has_table_privilege('service_role', 'public.' || name, 'SELECT')
      and pg_catalog.has_table_privilege('service_role', 'public.' || name, 'INSERT')
      and pg_catalog.has_table_privilege('service_role', 'public.' || name, 'UPDATE')
      and pg_catalog.has_table_privilege('service_role', 'public.' || name, 'DELETE')
    )
    from unnest(array[
      'areas', 'guilds', 'nikkes', 'members', 'attacks',
      'boss_levels', 'season_bosses', 'season_coef',
      'auth_session', 'sync_log'
    ]) as r(name)
  ),
  'service_role has CRUD privileges on all ten tables'
);

select ok(
  pg_catalog.has_sequence_privilege('service_role', 'public.attacks_id_seq', 'USAGE')
  and pg_catalog.has_sequence_privilege('service_role', 'public.attacks_id_seq', 'SELECT')
  and pg_catalog.has_sequence_privilege('service_role', 'public.attacks_id_seq', 'UPDATE')
  and pg_catalog.has_sequence_privilege('service_role', 'public.sync_log_id_seq', 'USAGE')
  and pg_catalog.has_sequence_privilege('service_role', 'public.sync_log_id_seq', 'SELECT')
  and pg_catalog.has_sequence_privilege('service_role', 'public.sync_log_id_seq', 'UPDATE'),
  'service_role has required sequence privileges'
);

select ok(
  not pg_catalog.has_sequence_privilege('anon', 'public.attacks_id_seq', 'USAGE')
  and not pg_catalog.has_sequence_privilege('authenticated', 'public.attacks_id_seq', 'USAGE')
  and not pg_catalog.has_sequence_privilege('anon', 'public.sync_log_id_seq', 'USAGE')
  and not pg_catalog.has_sequence_privilege('authenticated', 'public.sync_log_id_seq', 'USAGE'),
  'API read roles have no sequence privileges'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.v_sync_queue', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.v_sync_queue', 'UPDATE'),
  'API roles have no mutation privileges on the sync queue view'
);

select ok(
  pg_catalog.has_schema_privilege('anon', 'public', 'USAGE')
  and pg_catalog.has_schema_privilege('authenticated', 'public', 'USAGE')
  and pg_catalog.has_schema_privilege('service_role', 'public', 'USAGE'),
  'all intended API roles can use the public schema'
);

select * from finish();
rollback;
