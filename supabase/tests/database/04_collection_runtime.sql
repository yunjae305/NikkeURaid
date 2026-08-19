begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(50);

create function pg_temp.tap_attack(
  p_source_index int,
  p_season int,
  p_openid text,
  p_nickname text,
  p_damage text,
  p_suffix text
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'source_index', p_source_index,
    'season', p_season,
    'day', 1,
    'step', 1,
    'difficulty', 1,
    'level', 1,
    'boss', 'Runtime Boss',
    'element', 'Fire',
    'boss_id', 'boss-' || p_suffix,
    'icon_id', 'icon-' || p_suffix,
    'openid', p_openid,
    'nickname', p_nickname,
    'sync_lv', 300,
    'total_damage', p_damage,
    'is_final_hit', false,
    'squad', jsonb_build_array(jsonb_build_object(
      'slot', 1,
      'tid', 10101,
      'lv', 300,
      'name', 'Runtime Nikke',
      'grade', '0',
      'break', '0'
    ))
  );
$$;

select ok(
  (
    select bool_and(not pg_catalog.has_function_privilege('anon', signature, 'EXECUTE'))
    from unnest(array[
      'public.register_or_touch_guild(integer,text)',
      'public.next_sync_batch(integer)',
      'public.claim_guild_sync(integer,text,uuid,text,integer)',
      'public.apply_collection(jsonb,uuid)',
      'public.fail_guild_sync(integer,text,uuid,text,text,integer,boolean)'
    ]) as f(signature)
  ),
  'anon cannot execute any collection runtime RPC'
);

select ok(
  (
    select bool_and(not pg_catalog.has_function_privilege('authenticated', signature, 'EXECUTE'))
    from unnest(array[
      'public.register_or_touch_guild(integer,text)',
      'public.next_sync_batch(integer)',
      'public.claim_guild_sync(integer,text,uuid,text,integer)',
      'public.apply_collection(jsonb,uuid)',
      'public.fail_guild_sync(integer,text,uuid,text,text,integer,boolean)'
    ]) as f(signature)
  ),
  'authenticated cannot execute any collection runtime RPC'
);

select ok(
  (
    select bool_and(pg_catalog.has_function_privilege('service_role', signature, 'EXECUTE'))
    from unnest(array[
      'public.register_or_touch_guild(integer,text)',
      'public.next_sync_batch(integer)',
      'public.claim_guild_sync(integer,text,uuid,text,integer)',
      'public.apply_collection(jsonb,uuid)',
      'public.fail_guild_sync(integer,text,uuid,text,text,integer,boolean)'
    ]) as f(signature)
  ),
  'service_role can execute all five collection runtime RPCs'
);

select ok(
  (
    select a.attnotnull
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.attacks'::regclass
      and a.attname = 'source_index'
      and not a.attisdropped
  ),
  'attack source_index is required'
);

select ok(
  exists(
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.attacks'::regclass
      and c.conname = 'attacks_source_position_unique'
      and pg_catalog.pg_get_constraintdef(c.oid)
        = 'UNIQUE (area_id, guild_id, season, source_index)'
  ),
  'attack identity uses the lossless upstream source position'
);

create temporary table tap_register_new as
select * from public.register_or_touch_guild(83, '10001');

select ok((select created from tap_register_new), 'first lookup registers a guild');
select is((select sync_state from tap_register_new), 'pending', 'new guild starts pending');
select ok(
  (select should_collect and not rate_limited and last_requested is not null from tap_register_new),
  'new guild is immediately eligible and records the request time'
);

create temporary table tap_register_again as
select * from public.register_or_touch_guild(83, '10001');

select ok(
  (select not created and should_collect and not rate_limited from tap_register_again),
  'an existing pending guild is touched without being re-created'
);

insert into public.guilds (
  area_id, guild_id, name, sync_state, first_seen, last_viewed
)
select
  83,
  (11000 + n)::text,
  'Queue ' || n,
  'pending',
  now(),
  now()
from generate_series(0, 24) as s(n);

select is(
  (select count(*)::int from public.next_sync_batch(999)),
  20,
  'dispatcher batch is clamped to twenty jobs'
);

insert into public.guilds (
  area_id, guild_id, name, sync_state, first_seen, last_viewed
) values (
  83, '11999', 'Stale', 'pending', now() - interval '100 days', now() - interval '100 days'
);

select is(
  (select count(*)::int from public.next_sync_batch(20) where guild_id = '11999'),
  0,
  'dispatcher excludes guilds not viewed for ninety days'
);

insert into public.guilds (
  area_id, guild_id, name, sync_state, first_seen, last_viewed,
  sync_token, sync_lease_until, sync_trigger
) values (
  83, '11998', 'Expired', 'syncing', now(), now(),
  '00000000-0000-4000-8000-000000000098'::uuid,
  now() - interval '1 second',
  'cron'
);

create temporary table tap_reap_batch as
select * from public.next_sync_batch(20);

select ok(
  (
    select sync_state = 'pending'
       and sync_token is null
       and sync_lease_until is null
       and last_error_code = 'lease_expired'
    from public.guilds
    where area_id = 83 and guild_id = '11998'
  ),
  'dispatcher reaps an expired lease before reading the queue'
);

create temporary table tap_rate_limited as
select * from public.register_or_touch_guild(83, '19999');

select ok(
  (select rate_limited and not created and not should_collect from tap_rate_limited),
  'global new-guild minute cap returns an explicit rate limit'
);

select is(
  (select count(*)::int from public.guilds where area_id = 83 and guild_id = '19999'),
  0,
  'a rate-limited guild is not persisted'
);

create temporary table tap_existing_after_cap as
select * from public.register_or_touch_guild(83, '10001');

select ok(
  (select not rate_limited and not created from tap_existing_after_cap),
  'the global cap never blocks an existing guild touch'
);

create temporary table tap_claim as
select * from public.claim_guild_sync(
  83,
  '10001',
  '00000000-0000-4000-8000-000000000001'::uuid,
  'on_demand',
  120
);

select ok((select claimed from tap_claim), 'first worker atomically claims the guild');
select ok(
  (select sync_state = 'syncing' and lease_until > now() from tap_claim),
  'successful claim returns the active lease'
);

create temporary table tap_competing_claim as
select * from public.claim_guild_sync(
  83,
  '10001',
  '00000000-0000-4000-8000-000000000002'::uuid,
  'on_demand',
  120
);

select ok(
  (select not claimed and reason = 'already_claimed' from tap_competing_claim),
  'a competing token cannot claim an active lease'
);

create temporary table tap_stale_apply as
select * from public.apply_collection(
  '{"area_id":83,"guild_id":"10001"}'::jsonb,
  '00000000-0000-4000-8000-000000000002'::uuid
);

select ok(
  (select not applied and reason = 'stale_claim' from tap_stale_apply),
  'a wrong token is rejected before any payload mutation'
);

select throws_ok(
  $$
    select *
    from public.apply_collection(
      '{
        "area_id":83,
        "guild_id":"10001",
        "duration_ms":1,
        "guild":{"name":null,"member_count":null},
        "roster":{"state":"unknown","members":[]},
        "settled_attacks":[],
        "live":null,
        "boss_levels":[{}]
      }'::jsonb,
      '00000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  '22023',
  'boss_levels must remain empty until its API shape is verified',
  'unverified boss-level fields are rejected atomically'
);

select ok(
  (
    select sync_state = 'syncing'
       and sync_token = '00000000-0000-4000-8000-000000000001'::uuid
    from public.guilds
    where area_id = 83 and guild_id = '10001'
  )
  and (select count(*) = 0 from public.attacks where area_id = 83 and guild_id = '10001'),
  'a rejected payload leaves both the lease and tenant data unchanged'
);

insert into public.guilds (area_id, guild_id, name, sync_state, last_viewed)
values (82, '10001', 'Other Tenant', 'ok', now());
insert into public.members (area_id, guild_id, openid, nickname, is_active)
values (82, '10001', 'other-member', 'Other', true);
insert into public.members (area_id, guild_id, openid, nickname, is_active)
values (83, '10001', 'missing-current', 'Missing', true);

create temporary table tap_initial_apply as
select *
from public.apply_collection(
  jsonb_build_object(
    'area_id', 83,
    'guild_id', '10001',
    'duration_ms', 42,
    'guild', jsonb_build_object('name', 'Runtime Guild', 'member_count', 2),
    'roster', jsonb_build_object(
      'state', 'complete',
      'members', jsonb_build_array(
        jsonb_build_object(
          'openid', 'current-1', 'nickname', 'Current One', 'sync_lv', 300,
          'commander_level', 500, 'icon_id', 'member-icon-1'
        ),
        jsonb_build_object(
          'openid', 'current-2', 'nickname', 'Current Two', 'sync_lv', 301,
          'commander_level', 501, 'icon_id', 'member-icon-2'
        )
      )
    ),
    'settled_attacks', jsonb_build_array(
      pg_temp.tap_attack(0, 42, 'historical', 'Historical', '100', 'settled-a'),
      pg_temp.tap_attack(1, 42, 'historical', 'Historical', '100', 'settled-b')
    ),
    'live', jsonb_build_object(
      'season', 43,
      'attacks', jsonb_build_array(
        pg_temp.tap_attack(0, 43, 'current-1', 'Current One', '200', 'live-a'),
        pg_temp.tap_attack(1, 43, 'current-2', 'Current Two', '300', 'live-b')
      )
    ),
    'boss_levels', jsonb_build_array()
  ),
  '00000000-0000-4000-8000-000000000001'::uuid
);

select ok(
  (select applied and sync_state = 'ok' from tap_initial_apply),
  'valid normalized data applies successfully'
);

select ok(
  (select inserted = 4 and live_replaced from tap_initial_apply),
  'initial apply records all attacks and installs the live snapshot'
);

select ok(
  (
    select name = 'Runtime Guild'
       and member_count = 2
       and roster_state = 'complete'
       and sync_state = 'ok'
    from public.guilds
    where area_id = 83 and guild_id = '10001'
  ),
  'guild metadata and complete roster state are committed together'
);

select is(
  (
    select count(*)::int
    from public.members
    where area_id = 83 and guild_id = '10001'
      and openid in ('current-1', 'current-2')
      and is_active
  ),
  2,
  'complete roster members are active'
);

select ok(
  (
    select not is_active
    from public.members
    where area_id = 83 and guild_id = '10001' and openid = 'historical'
  ),
  'an attack-only historical identity is preserved as inactive'
);

select ok(
  (
    select not is_active
    from public.members
    where area_id = 83 and guild_id = '10001' and openid = 'missing-current'
  ),
  'complete roster deactivates a member no longer present'
);

select is(
  (select count(*)::int from public.attacks where area_id = 83 and guild_id = '10001'),
  4,
  'settled and live attacks are stored in the claimed tenant only'
);

select is(
  (
    select count(*)::int
    from public.attacks
    where area_id = 83 and guild_id = '10001' and season = 42
      and openid = 'historical' and boss = 'Runtime Boss' and total_damage = 100
  ),
  2,
  'two legitimate attacks with the old colliding natural key are both retained'
);

select ok(
  (
    select element = 'Fire'
       and boss_id = 'boss-settled-a'
       and icon_id = 'icon-settled-a'
    from public.attacks
    where area_id = 83 and guild_id = '10001' and season = 42 and source_index = 0
  ),
  'verified optional attack identifiers are preserved'
);

select ok(
  exists(
    select 1
    from public.members
    where area_id = 82 and guild_id = '10001'
      and openid = 'other-member' and is_active
  )
  and not exists(
    select 1
    from public.attacks
    where area_id = 82 and guild_id = '10001'
  ),
  'apply_collection cannot cross the claimed area and guild boundary'
);

select ok(
  (
    select sync_token is null
       and sync_lease_until is null
       and fail_count = 0
       and last_synced is not null
    from public.guilds
    where area_id = 83 and guild_id = '10001'
  )
  and exists(
    select 1
    from public.sync_log
    where area_id = 83 and guild_id = '10001'
      and ok and inserted = 4 and duration_ms = 42
      and note = 'roster=complete settled=2 live=2 replaced=true'
  ),
  'success clears the lease and writes bounded audit metadata'
);

create temporary table tap_claim_smaller as
select * from public.claim_guild_sync(
  83, '10001', '00000000-0000-4000-8000-000000000003'::uuid, 'manual', 120
);

create temporary table tap_smaller_apply as
select *
from public.apply_collection(
  jsonb_build_object(
    'area_id', 83,
    'guild_id', '10001',
    'duration_ms', 10,
    'guild', jsonb_build_object('name', null, 'member_count', null),
    'roster', jsonb_build_object(
      'state', 'limited',
      'members', jsonb_build_array(
        jsonb_build_object(
          'openid', 'current-1', 'nickname', 'Current One', 'sync_lv', 302,
          'commander_level', null, 'icon_id', null
        )
      )
    ),
    'settled_attacks', jsonb_build_array(),
    'live', jsonb_build_object(
      'season', 43,
      'attacks', jsonb_build_array(
        pg_temp.tap_attack(0, 43, 'current-1', 'Current One', '250', 'live-new')
      )
    ),
    'boss_levels', jsonb_build_array()
  ),
  '00000000-0000-4000-8000-000000000003'::uuid
);

select ok(
  (select applied and not live_replaced from tap_smaller_apply),
  'a smaller live response is applied without replacing the snapshot'
);

select is(
  (
    select count(*)::int
    from public.attacks
    where area_id = 83 and guild_id = '10001' and season = 43
  ),
  2,
  'smaller live response cannot delete a previously seen attack'
);

select ok(
  (
    select total_damage = 250
       and boss_id = 'boss-live-new'
       and icon_id = 'icon-live-new'
    from public.attacks
    where area_id = 83 and guild_id = '10001' and season = 43 and source_index = 0
  ),
  'source-position upsert refreshes verified attack fields'
);

select ok(
  (
    select is_active
    from public.members
    where area_id = 83 and guild_id = '10001' and openid = 'current-2'
  )
  and (
    select roster_state = 'limited'
    from public.guilds
    where area_id = 83 and guild_id = '10001'
  ),
  'limited roster never deactivates an omitted member'
);

create temporary table tap_claim_equal as
select * from public.claim_guild_sync(
  83, '10001', '00000000-0000-4000-8000-000000000004'::uuid, 'manual', 120
);

create temporary table tap_equal_apply as
select *
from public.apply_collection(
  jsonb_build_object(
    'area_id', 83,
    'guild_id', '10001',
    'duration_ms', 11,
    'guild', jsonb_build_object('name', null, 'member_count', null),
    'roster', jsonb_build_object('state', 'unknown', 'members', jsonb_build_array()),
    'settled_attacks', jsonb_build_array(),
    'live', jsonb_build_object(
      'season', 43,
      'attacks', jsonb_build_array(
        pg_temp.tap_attack(0, 43, 'current-1', 'Current One', '260', 'equal-a'),
        pg_temp.tap_attack(2, 43, 'current-2', 'Current Two', '400', 'equal-c')
      )
    ),
    'boss_levels', jsonb_build_array()
  ),
  '00000000-0000-4000-8000-000000000004'::uuid
);

select ok(
  (select applied and live_replaced from tap_equal_apply),
  'an equal-size live response replaces the old snapshot'
);

select is(
  (
    select array_agg(source_index order by source_index)
    from public.attacks
    where area_id = 83 and guild_id = '10001' and season = 43
  ),
  array[0, 2]::int[],
  'live replacement removes source positions absent from the fresh response'
);

select ok(
  (
    select roster_state = 'unknown'
    from public.guilds
    where area_id = 83 and guild_id = '10001'
  )
  and (
    select count(*) = 2
    from public.members
    where area_id = 83 and guild_id = '10001'
      and openid in ('current-1', 'current-2') and is_active
  ),
  'unknown roster preserves existing membership while marking coverage unknown'
);

create temporary table tap_claim_idempotent as
select * from public.claim_guild_sync(
  83, '10001', '00000000-0000-4000-8000-000000000005'::uuid, 'manual', 120
);

create temporary table tap_idempotent_apply as
select *
from public.apply_collection(
  jsonb_build_object(
    'area_id', 83,
    'guild_id', '10001',
    'duration_ms', 12,
    'guild', jsonb_build_object('name', null, 'member_count', null),
    'roster', jsonb_build_object('state', 'unknown', 'members', jsonb_build_array()),
    'settled_attacks', jsonb_build_array(
      pg_temp.tap_attack(0, 42, 'historical', 'Historical', '100', 'settled-a'),
      pg_temp.tap_attack(1, 42, 'historical', 'Historical', '100', 'settled-b')
    ),
    'live', null,
    'boss_levels', jsonb_build_array()
  ),
  '00000000-0000-4000-8000-000000000005'::uuid
);

select ok(
  (select applied and inserted = 0 from tap_idempotent_apply),
  'settled re-collection is idempotent by source position'
);

select is(
  (
    select count(*)::int
    from public.attacks
    where area_id = 83 and guild_id = '10001' and season = 42
  ),
  2,
  'idempotent settled apply does not duplicate attacks'
);

insert into public.guilds (area_id, guild_id, sync_state, first_seen, last_viewed)
values (83, '12001', 'pending', now() - interval '2 days', now());
create temporary table tap_permission_claim as
select * from public.claim_guild_sync(
  83, '12001', '00000000-0000-4000-8000-000000000006'::uuid, 'manual', 120
);
create temporary table tap_permission_fail as
select * from public.fail_guild_sync(
  83,
  '12001',
  '00000000-0000-4000-8000-000000000006'::uuid,
  'upstream_permission_denied',
  'endpoint=members status=403 category=permission',
  20,
  false
);

select ok(
  (select applied and sync_state = 'dead' and fail_count = 1 from tap_permission_fail),
  'verified foreign permission denial is terminal on the first failure'
);

select ok(
  (
    select sync_state = 'dead'
       and sync_token is null
       and last_error_code = 'upstream_permission_denied'
    from public.guilds
    where area_id = 83 and guild_id = '12001'
  ),
  'terminal permission failure clears its lease and retains a safe error code'
);

create temporary table tap_dead_claim as
select * from public.claim_guild_sync(
  83, '12001', '00000000-0000-4000-8000-000000000016'::uuid, 'manual', 120
);

select ok(
  (select not claimed and reason = 'parked' from tap_dead_claim),
  'dead guild cannot re-enter collection through the dispatcher'
);

insert into public.guilds (area_id, guild_id, sync_state, first_seen, last_viewed)
values (83, '12002', 'pending', now() - interval '2 days', now());
create temporary table tap_auth_claim as
select * from public.claim_guild_sync(
  83, '12002', '00000000-0000-4000-8000-000000000007'::uuid, 'manual', 120
);
create temporary table tap_auth_fail as
select * from public.fail_guild_sync(
  83,
  '12002',
  '00000000-0000-4000-8000-000000000007'::uuid,
  'session_expired',
  'endpoint=user_info status=401 category=auth',
  21,
  true
);

select ok(
  (select applied and sync_state = 'auth_required' from tap_auth_fail),
  'a real service-session failure parks the guild as auth_required'
);

create temporary table tap_auth_immediate as
select * from public.register_or_touch_guild(83, '12002');

select ok(
  (select sync_state = 'auth_required' and not should_collect from tap_auth_immediate),
  'auth_required retry cooldown prevents an immediate loop'
);

update public.guilds
set last_requested = now() - interval '6 minutes'
where area_id = 83 and guild_id = '12002';

create temporary table tap_auth_resume as
select * from public.register_or_touch_guild(83, '12002');

select ok(
  (
    select sync_state = 'pending'
       and should_collect
       and last_error_code is null
    from tap_auth_resume
  ),
  'auth_required guild retries after cooldown so a refreshed secret can recover'
);

insert into public.guilds (area_id, guild_id, sync_state, first_seen, last_viewed)
values (83, '12003', 'pending', now() - interval '2 days', now());

create temporary table tap_transient_claim_1 as
select * from public.claim_guild_sync(
  83, '12003', '00000000-0000-4000-8000-000000000008'::uuid, 'manual', 120
);
create temporary table tap_transient_fail_1 as
select * from public.fail_guild_sync(
  83, '12003', '00000000-0000-4000-8000-000000000008'::uuid,
  'upstream_5xx', 'endpoint=raid status=500 category=upstream', 22, false
);
select ok(
  (select applied and sync_state = 'pending' and fail_count = 1 from tap_transient_fail_1),
  'first transient failure remains retryable'
);

create temporary table tap_transient_claim_2 as
select * from public.claim_guild_sync(
  83, '12003', '00000000-0000-4000-8000-000000000009'::uuid, 'manual', 120
);
create temporary table tap_transient_fail_2 as
select * from public.fail_guild_sync(
  83, '12003', '00000000-0000-4000-8000-000000000009'::uuid,
  'upstream_5xx', 'endpoint=raid status=500 category=upstream', 23, false
);
select ok(
  (select applied and sync_state = 'pending' and fail_count = 2 from tap_transient_fail_2),
  'second transient failure remains retryable'
);

create temporary table tap_transient_claim_3 as
select * from public.claim_guild_sync(
  83, '12003', '00000000-0000-4000-8000-000000000010'::uuid, 'manual', 120
);
create temporary table tap_transient_fail_3 as
select * from public.fail_guild_sync(
  83, '12003', '00000000-0000-4000-8000-000000000010'::uuid,
  'upstream_5xx', 'endpoint=raid status=500 category=upstream', 24, false
);
select ok(
  (select applied and sync_state = 'dead' and fail_count = 3 from tap_transient_fail_3),
  'third consecutive transient failure moves the guild to dead'
);

select * from finish();
rollback;
