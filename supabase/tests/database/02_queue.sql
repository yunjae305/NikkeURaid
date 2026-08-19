begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

insert into public.guilds (
  area_id, guild_id, name, sync_state, last_synced, last_viewed
) values
  (81, 'tap-q-pending', 'Pending', 'pending', null, now()),
  (81, 'tap-q-hot', 'Hot', 'ok', now() - interval '6 minutes', now() - interval '1 minute'),
  (81, 'tap-q-warm', 'Warm', 'ok', now() - interval '31 minutes', now() - interval '1 day'),
  (81, 'tap-q-cold', 'Cold', 'ok', now() - interval '7 hours', null),
  (81, 'tap-q-fresh', 'Fresh', 'ok', now() - interval '1 minute', now()),
  (81, 'tap-q-stale', 'Stale', 'ok', now() - interval '7 hours', now() - interval '91 days'),
  (81, 'tap-q-auth', 'Auth required', 'auth_required', null, now()),
  (81, 'tap-q-dead', 'Dead', 'dead', null, now());

insert into public.guilds (
  area_id, guild_id, name, sync_state, last_synced, last_viewed,
  sync_token, sync_lease_until, sync_trigger
) values (
  81, 'tap-q-syncing', 'Syncing', 'syncing', null, now(),
  '00000000-0000-4000-8000-000000000099'::uuid,
  now() + interval '2 minutes',
  'cron'
);

select is(
  (
    select array_agg(guild_id order by guild_id)
    from public.v_sync_queue
    where guild_id like 'tap-q-%'
  ),
  array['tap-q-cold', 'tap-q-hot', 'tap-q-pending', 'tap-q-warm']::text[],
  'queue contains only due pending/ok guilds'
);

select is(
  (
    select count(*)::int
    from public.v_sync_queue q
    join public.guilds g using (area_id, guild_id)
    where q.guild_id like 'tap-q-%'
      and g.sync_state not in ('pending', 'ok')
  ),
  0,
  'auth_required, syncing, and dead states never enter the queue'
);

select is(
  (select sync_interval from public.v_sync_queue where guild_id = 'tap-q-hot'),
  interval '5 minutes',
  'recently viewed guilds use a five-minute interval'
);

select is(
  (select sync_interval from public.v_sync_queue where guild_id = 'tap-q-warm'),
  interval '30 minutes',
  'guilds viewed within three days use a thirty-minute interval'
);

select is(
  (select sync_interval from public.v_sync_queue where guild_id = 'tap-q-cold'),
  interval '6 hours',
  'cold guilds use a six-hour interval'
);

select is(
  (select count(*)::int from public.v_sync_queue where guild_id = 'tap-q-stale'),
  0,
  'guilds not viewed for ninety days stay out of the queue'
);

select * from finish();
rollback;
