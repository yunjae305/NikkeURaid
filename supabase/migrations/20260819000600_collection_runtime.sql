-- Collection runtime state and service-only database boundary.
--
-- Edge Functions normalize upstream responses. This migration owns the
-- concurrency and atomicity guarantees: one lease per guild, stale-token
-- rejection, tenant keys taken only from the claimed guild, and all-or-nothing
-- application of a normalized collection payload.

alter table public.guilds
  add column last_requested timestamptz,
  add column sync_token uuid,
  add column sync_lease_until timestamptz,
  add column sync_trigger text,
  add column last_error_code text,
  add column last_error_at timestamptz;

-- There was no collector capable of owning legacy `syncing` rows before this
-- migration. Return any such row to the queue before enforcing lease state.
update public.guilds
set sync_state = 'pending'
where sync_state = 'syncing';

alter table public.guilds
  add constraint guilds_sync_trigger_valid
    check (sync_trigger is null or sync_trigger in ('cron', 'on_demand', 'manual')),
  add constraint guilds_error_code_safe
    check (
      last_error_code is null
      or last_error_code ~ '^[a-z0-9][a-z0-9_:-]{0,63}$'
    ),
  add constraint guilds_sync_lease_consistent
    check (
      (
        sync_state = 'syncing'
        and sync_token is not null
        and sync_lease_until is not null
        and sync_trigger is not null
      )
      or
      (
        sync_state <> 'syncing'
        and sync_token is null
        and sync_lease_until is null
        and sync_trigger is null
      )
    );

create index guilds_expired_lease_idx
  on public.guilds (sync_lease_until)
  where sync_state = 'syncing';

-- The original natural-looking attack key is not unique in verified data: two
-- legitimate attacks can have the same member, boss, and damage. The upstream
-- participate_data index is stable for settled seasons, while live seasons are
-- replaced as a whole, so retain that source position as the lossless key.
alter table public.attacks
  add column source_index int;

with numbered as (
  select
    a.id,
    row_number() over (
      partition by a.area_id, a.guild_id, a.season
      order by a.id
    ) - 1 as source_index
  from public.attacks a
)
update public.attacks as a
set source_index = n.source_index
from numbered n
where n.id = a.id;

do $$
declare
  v_constraint_name text;
begin
  select c.conname
  into v_constraint_name
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.attacks'::regclass
    and c.contype = 'u'
    and pg_catalog.pg_get_constraintdef(c.oid)
      = 'UNIQUE (area_id, guild_id, season, day, openid, boss, total_damage)'
  limit 1;

  if v_constraint_name is not null then
    execute format(
      'alter table public.attacks drop constraint %I',
      v_constraint_name
    );
  end if;
end;
$$;

alter table public.attacks
  alter column source_index set not null,
  add constraint attacks_source_index_nonnegative
    check (source_index >= 0),
  add constraint attacks_source_position_unique
    unique (area_id, guild_id, season, source_index);

-- Profile fields are supplied by GetGuildMembers. The verified member_id is
-- the canonical value stored in the existing members.openid key.
alter table public.members
  add column sync_lv int,
  add column commander_level int,
  add column icon_id text;

alter table public.members
  add constraint members_sync_lv_nonnegative
    check (sync_lv is null or sync_lv >= 0),
  add constraint members_commander_level_nonnegative
    check (commander_level is null or commander_level >= 0);

-- Cache the normalized account identifier, never the raw login response.
alter table public.auth_session
  add column intl_openid text;

-- Store only bounded operational metadata. Raw upstream payloads, cookies,
-- member IDs, and nicknames are deliberately excluded from the audit table.
alter table public.sync_log
  add column trigger text,
  add column error_code text;

alter table public.sync_log
  add constraint sync_log_trigger_valid
    check (trigger is null or trigger in ('cron', 'on_demand', 'manual')),
  add constraint sync_log_error_code_safe
    check (
      error_code is null
      or error_code ~ '^[a-z0-9][a-z0-9_:-]{0,63}$'
    ),
  add constraint sync_log_note_bounded
    check (note is null or length(note) <= 240);

create or replace function public.register_or_touch_guild(
  p_area_id int,
  p_guild_id text
)
returns table (
  area_id int,
  guild_id text,
  sync_state text,
  roster_state text,
  created boolean,
  should_collect boolean,
  rate_limited boolean,
  last_requested timestamptz,
  last_synced timestamptz,
  last_error_code text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_created boolean := false;
  v_exists boolean;
  v_recent_minute int;
  v_recent_day int;
begin
  if p_area_id is null
     or not exists (select 1 from public.areas a where a.area_id = p_area_id) then
    raise exception using
      errcode = '22023',
      message = 'unsupported area_id';
  end if;

  if p_guild_id is null or p_guild_id !~ '^[0-9]{1,20}$' then
    raise exception using
      errcode = '22023',
      message = 'guild_id must contain 1 to 20 digits';
  end if;

  select exists (
    select 1
    from public.guilds g
    where g.area_id = p_area_id
      and g.guild_id = p_guild_id
  ) into v_exists;

  if not v_exists then
    -- The caller is a trusted server but its route is public. Serialize only
    -- first-time registrations so rotating guild IDs cannot bypass per-guild
    -- freshness checks and fan out unbounded upstream requests.
    perform pg_catalog.pg_advisory_xact_lock(68191421124261001::bigint);

    select exists (
      select 1
      from public.guilds g
      where g.area_id = p_area_id
        and g.guild_id = p_guild_id
    ) into v_exists;

    if not v_exists then
      select
        count(*) filter (where g.first_seen >= v_now - interval '1 minute')::int,
        count(*) filter (where g.first_seen >= v_now - interval '24 hours')::int
      into v_recent_minute, v_recent_day
      from public.guilds g;

      if v_recent_minute >= 5 or v_recent_day >= 100 then
        return query
        select
          p_area_id,
          p_guild_id,
          'pending'::text,
          'unknown'::text,
          false,
          false,
          true,
          null::timestamptz,
          null::timestamptz,
          'rate_limited'::text;
        return;
      end if;

      insert into public.guilds (
        area_id,
        guild_id,
        sync_state,
        roster_state,
        first_seen,
        last_viewed,
        last_requested
      ) values (
        p_area_id,
        p_guild_id,
        'pending',
        'unknown',
        v_now,
        v_now,
        v_now
      );
      v_created := true;
    end if;
  end if;

  if not v_created then
    -- A crashed worker cannot leave a guild permanently hidden from both the
    -- dispatcher and the on-demand path.
    update public.guilds as g
    set last_viewed = v_now,
        last_requested = v_now,
        sync_state = case
          when g.sync_state = 'syncing' and g.sync_lease_until <= v_now
            then 'pending'
          when g.sync_state = 'auth_required'
               and coalesce(g.last_requested, g.last_error_at, g.first_seen)
                 <= v_now - interval '5 minutes'
            then 'pending'
          else g.sync_state
        end,
        sync_token = case
          when g.sync_state = 'syncing' and g.sync_lease_until <= v_now
            then null
          else g.sync_token
        end,
        sync_lease_until = case
          when g.sync_state = 'syncing' and g.sync_lease_until <= v_now
            then null
          else g.sync_lease_until
        end,
        sync_trigger = case
          when g.sync_state = 'syncing' and g.sync_lease_until <= v_now
            then null
          else g.sync_trigger
        end,
        last_error_code = case
          when g.sync_state = 'syncing' and g.sync_lease_until <= v_now
            then 'lease_expired'
          when g.sync_state = 'auth_required'
               and coalesce(g.last_requested, g.last_error_at, g.first_seen)
                 <= v_now - interval '5 minutes'
            then null
          else g.last_error_code
        end,
        last_error_at = case
          when g.sync_state = 'syncing' and g.sync_lease_until <= v_now
            then v_now
          when g.sync_state = 'auth_required'
               and coalesce(g.last_requested, g.last_error_at, g.first_seen)
                 <= v_now - interval '5 minutes'
            then null
          else g.last_error_at
        end
    where g.area_id = p_area_id
      and g.guild_id = p_guild_id;
  end if;

  return query
  select
    g.area_id,
    g.guild_id,
    g.sync_state,
    g.roster_state,
    v_created,
    (
      g.sync_state = 'pending'
      or (
        g.sync_state = 'ok'
        and (
          g.last_synced is null
          or g.last_synced < v_now - case
            when g.last_viewed > v_now - interval '10 minutes' then interval '5 minutes'
            when g.last_viewed > v_now - interval '3 days' then interval '30 minutes'
            else interval '6 hours'
          end
        )
      )
    ) as should_collect,
    false as rate_limited,
    g.last_requested,
    g.last_synced,
    g.last_error_code
  from public.guilds g
  where g.area_id = p_area_id
    and g.guild_id = p_guild_id;
end;
$$;

create or replace function public.next_sync_batch(
  p_limit int default 20
)
returns table (
  area_id int,
  guild_id text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 20);
begin
  -- Reap expired leases before reading the ordinary pending/ok queue. Rows not
  -- viewed for 90 days remain excluded by v_sync_queue after being reaped.
  update public.guilds as g
  set sync_state = 'pending',
      sync_token = null,
      sync_lease_until = null,
      sync_trigger = null,
      last_error_code = 'lease_expired',
      last_error_at = v_now
  where g.sync_state = 'syncing'
    and g.sync_lease_until <= v_now;

  return query
  select q.area_id, q.guild_id
  from public.v_sync_queue q
  limit v_limit;
end;
$$;

create or replace function public.claim_guild_sync(
  p_area_id int,
  p_guild_id text,
  p_token uuid,
  p_trigger text default 'cron',
  p_lease_seconds int default 120
)
returns table (
  claimed boolean,
  reason text,
  sync_state text,
  lease_until timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_lease_seconds int := least(greatest(coalesce(p_lease_seconds, 120), 30), 900);
  v_state text;
  v_last_synced timestamptz;
  v_last_viewed timestamptz;
  v_first_seen timestamptz;
  v_existing_lease timestamptz;
begin
  if p_area_id is null or p_guild_id is null or p_token is null then
    raise exception using errcode = '22023', message = 'area_id, guild_id, and token are required';
  end if;

  if p_trigger is null or p_trigger not in ('cron', 'on_demand', 'manual') then
    raise exception using errcode = '22023', message = 'unsupported sync trigger';
  end if;

  select
    g.sync_state,
    g.last_synced,
    g.last_viewed,
    g.first_seen,
    g.sync_lease_until
  into
    v_state,
    v_last_synced,
    v_last_viewed,
    v_first_seen,
    v_existing_lease
  from public.guilds g
  where g.area_id = p_area_id
    and g.guild_id = p_guild_id
  for update;

  if not found then
    return query select false, 'not_found'::text, 'pending'::text, null::timestamptz;
    return;
  end if;

  if v_state in ('auth_required', 'dead') then
    return query select false, 'parked'::text, v_state, null::timestamptz;
    return;
  end if;

  if v_state = 'syncing' and v_existing_lease > v_now then
    return query select false, 'already_claimed'::text, v_state, v_existing_lease;
    return;
  end if;

  if p_trigger <> 'manual' and (
    coalesce(v_last_viewed, v_first_seen) < v_now - interval '90 days'
    or (
      v_state = 'ok'
      and v_last_synced is not null
      and v_last_synced >= v_now - case
        when v_last_viewed > v_now - interval '10 minutes' then interval '5 minutes'
        when v_last_viewed > v_now - interval '3 days' then interval '30 minutes'
        else interval '6 hours'
      end
    )
  ) then
    return query select false, 'not_due'::text, v_state, null::timestamptz;
    return;
  end if;

  update public.guilds as g
  set sync_state = 'syncing',
      sync_token = p_token,
      sync_lease_until = v_now + make_interval(secs => v_lease_seconds),
      sync_trigger = p_trigger
  where g.area_id = p_area_id
    and g.guild_id = p_guild_id;

  return query
  select
    true,
    'claimed'::text,
    'syncing'::text,
    v_now + make_interval(secs => v_lease_seconds);
end;
$$;

create or replace function public.apply_collection(
  p_payload jsonb,
  p_token uuid
)
returns table (
  applied boolean,
  reason text,
  sync_state text,
  inserted int,
  live_replaced boolean,
  roster_state text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_area_id int;
  v_guild_id text;
  v_duration_ms int := 0;
  v_claim_state text;
  v_claim_token uuid;
  v_claim_lease timestamptz;
  v_trigger text;
  v_previous_roster_state text;
  v_roster_state text;
  v_roster_ids text[] := array[]::text[];
  v_guild_name text;
  v_member_count int;
  v_item jsonb;
  v_live jsonb;
  v_live_season int;
  v_fresh_live_count int := 0;
  v_existing_live_count int := 0;
  v_settled_count int := 0;
  v_inserted int := 0;
  v_live_replaced boolean := false;
  v_openid text;
  v_nickname text;
  v_member_sync_lv int;
  v_commander_level int;
  v_icon_id text;
  v_source_index int;
  v_season int;
  v_day int;
  v_step int;
  v_difficulty int;
  v_level int;
  v_boss text;
  v_element text;
  v_boss_id text;
  v_attack_icon_id text;
  v_attack_sync_lv int;
  v_damage_text text;
  v_damage bigint;
  v_final_hit boolean;
  v_squad jsonb;
  v_was_inserted boolean;
begin
  if p_token is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'payload object and token are required';
  end if;

  if jsonb_typeof(p_payload -> 'area_id') <> 'number'
     or (p_payload ->> 'area_id') !~ '^[0-9]+$' then
    raise exception using errcode = '22023', message = 'payload area_id is invalid';
  end if;
  v_area_id := (p_payload ->> 'area_id')::int;

  if jsonb_typeof(p_payload -> 'guild_id') <> 'string'
     or (p_payload ->> 'guild_id') !~ '^[0-9]{1,20}$' then
    raise exception using errcode = '22023', message = 'payload guild_id is invalid';
  end if;
  v_guild_id := p_payload ->> 'guild_id';

  select
    g.sync_state,
    g.sync_token,
    g.sync_lease_until,
    g.sync_trigger,
    g.roster_state
  into
    v_claim_state,
    v_claim_token,
    v_claim_lease,
    v_trigger,
    v_previous_roster_state
  from public.guilds g
  where g.area_id = v_area_id
    and g.guild_id = v_guild_id
  for update;

  if not found
     or v_claim_state <> 'syncing'
     or v_claim_token is distinct from p_token
     or v_claim_lease <= v_now then
    return query
    select
      false,
      'stale_claim'::text,
      coalesce(v_claim_state, 'pending'),
      0,
      false,
      coalesce(v_previous_roster_state, 'unknown');
    return;
  end if;

  if p_payload ? 'duration_ms' then
    if jsonb_typeof(p_payload -> 'duration_ms') <> 'number'
       or (p_payload ->> 'duration_ms') !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'duration_ms is invalid';
    end if;
    v_duration_ms := (p_payload ->> 'duration_ms')::int;
  end if;

  if jsonb_typeof(p_payload -> 'guild') <> 'object' then
    raise exception using errcode = '22023', message = 'guild object is required';
  end if;

  if p_payload -> 'guild' ? 'name'
     and jsonb_typeof(p_payload #> '{guild,name}') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'guild.name is invalid';
  end if;
  if jsonb_typeof(p_payload #> '{guild,name}') = 'string' then
    v_guild_name := btrim(p_payload #>> '{guild,name}');
    if v_guild_name = '' then
      raise exception using errcode = '22023', message = 'guild.name is empty';
    end if;
  end if;

  if p_payload -> 'guild' ? 'member_count'
     and jsonb_typeof(p_payload #> '{guild,member_count}') not in ('number', 'null') then
    raise exception using errcode = '22023', message = 'guild.member_count is invalid';
  end if;
  if jsonb_typeof(p_payload #> '{guild,member_count}') = 'number' then
    if (p_payload #>> '{guild,member_count}') !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'guild.member_count is invalid';
    end if;
    v_member_count := (p_payload #>> '{guild,member_count}')::int;
  end if;

  if jsonb_typeof(p_payload -> 'roster') <> 'object'
     or jsonb_typeof(p_payload #> '{roster,members}') <> 'array' then
    raise exception using errcode = '22023', message = 'roster object and members array are required';
  end if;
  v_roster_state := p_payload #>> '{roster,state}';
  if v_roster_state not in ('unknown', 'complete', 'limited') then
    raise exception using errcode = '22023', message = 'roster.state is invalid';
  end if;
  if v_roster_state = 'unknown'
     and jsonb_array_length(p_payload #> '{roster,members}') <> 0 then
    raise exception using errcode = '22023', message = 'unknown roster must not contain members';
  end if;

  if jsonb_typeof(p_payload -> 'settled_attacks') <> 'array' then
    raise exception using errcode = '22023', message = 'settled_attacks array is required';
  end if;
  v_settled_count := jsonb_array_length(p_payload -> 'settled_attacks');

  if not (p_payload ? 'live')
     or jsonb_typeof(p_payload -> 'live') not in ('object', 'null') then
    raise exception using errcode = '22023', message = 'live must be an object or null';
  end if;
  v_live := p_payload -> 'live';
  if jsonb_typeof(v_live) = 'object' then
    if jsonb_typeof(v_live -> 'season') <> 'number'
       or (v_live ->> 'season') !~ '^[1-9][0-9]*$'
       or jsonb_typeof(v_live -> 'attacks') <> 'array' then
      raise exception using errcode = '22023', message = 'live season or attacks is invalid';
    end if;
    v_live_season := (v_live ->> 'season')::int;
    v_fresh_live_count := jsonb_array_length(v_live -> 'attacks');
  end if;

  -- Boss-level response fields have not been verified yet. Explicitly accept
  -- only the evidence-backed empty shape rather than guessing a mapping.
  if jsonb_typeof(p_payload -> 'boss_levels') <> 'array'
     or jsonb_array_length(p_payload -> 'boss_levels') <> 0 then
    raise exception using errcode = '22023', message = 'boss_levels must remain empty until its API shape is verified';
  end if;

  -- Upsert the currently visible roster first. Attack-only identities are
  -- inserted later as inactive historical members.
  for v_item in
    select value from jsonb_array_elements(p_payload #> '{roster,members}')
  loop
    if jsonb_typeof(v_item) <> 'object'
       or v_item ? 'area_id'
       or v_item ? 'guild_id' then
      raise exception using errcode = '22023', message = 'roster member is invalid';
    end if;

    v_openid := btrim(coalesce(v_item ->> 'openid', ''));
    v_nickname := btrim(coalesce(v_item ->> 'nickname', ''));
    if v_openid = '' or v_nickname = '' then
      raise exception using errcode = '22023', message = 'roster identity is invalid';
    end if;
    if v_openid = any(v_roster_ids) then
      raise exception using errcode = '22023', message = 'roster contains a duplicate openid';
    end if;
    v_roster_ids := array_append(v_roster_ids, v_openid);

    v_member_sync_lv := null;
    if v_item ? 'sync_lv' and jsonb_typeof(v_item -> 'sync_lv') <> 'null' then
      if jsonb_typeof(v_item -> 'sync_lv') <> 'number'
         or (v_item ->> 'sync_lv') !~ '^[0-9]+$' then
        raise exception using errcode = '22023', message = 'roster sync_lv is invalid';
      end if;
      v_member_sync_lv := (v_item ->> 'sync_lv')::int;
    end if;

    v_commander_level := null;
    if v_item ? 'commander_level' and jsonb_typeof(v_item -> 'commander_level') <> 'null' then
      if jsonb_typeof(v_item -> 'commander_level') <> 'number'
         or (v_item ->> 'commander_level') !~ '^[0-9]+$' then
        raise exception using errcode = '22023', message = 'roster commander_level is invalid';
      end if;
      v_commander_level := (v_item ->> 'commander_level')::int;
    end if;

    v_icon_id := null;
    if v_item ? 'icon_id' and jsonb_typeof(v_item -> 'icon_id') <> 'null' then
      if jsonb_typeof(v_item -> 'icon_id') <> 'string' then
        raise exception using errcode = '22023', message = 'roster icon_id is invalid';
      end if;
      v_icon_id := nullif(btrim(v_item ->> 'icon_id'), '');
    end if;

    insert into public.members as m (
      area_id,
      guild_id,
      openid,
      nickname,
      sync_lv,
      commander_level,
      icon_id,
      is_active,
      first_seen,
      last_seen
    ) values (
      v_area_id,
      v_guild_id,
      v_openid,
      v_nickname,
      v_member_sync_lv,
      v_commander_level,
      v_icon_id,
      true,
      v_now,
      v_now
    )
    on conflict (area_id, guild_id, openid) do update
    set nickname = excluded.nickname,
        sync_lv = coalesce(excluded.sync_lv, m.sync_lv),
        commander_level = coalesce(excluded.commander_level, m.commander_level),
        icon_id = coalesce(excluded.icon_id, m.icon_id),
        is_active = true,
        last_seen = excluded.last_seen;
  end loop;

  if jsonb_typeof(v_live) = 'object' then
    select count(*)::int
    into v_existing_live_count
    from public.attacks a
    where a.area_id = v_area_id
      and a.guild_id = v_guild_id
      and a.season = v_live_season;

    if v_fresh_live_count > 0 and v_fresh_live_count >= v_existing_live_count then
      delete from public.attacks a
      where a.area_id = v_area_id
        and a.guild_id = v_guild_id
        and a.season = v_live_season;
      v_live_replaced := true;
    end if;

    for v_item in
      select value from jsonb_array_elements(v_live -> 'attacks')
    loop
      if jsonb_typeof(v_item) <> 'object'
         or v_item ? 'area_id'
         or v_item ? 'guild_id' then
        raise exception using errcode = '22023', message = 'live attack is invalid';
      end if;

      v_season := null;
      v_source_index := null;
      v_day := null;
      v_step := null;
      v_difficulty := null;
      v_level := null;
      v_element := null;
      v_boss_id := null;
      v_attack_icon_id := null;
      v_attack_sync_lv := null;

      if jsonb_typeof(v_item -> 'season') <> 'number'
         or (v_item ->> 'season') !~ '^[1-9][0-9]*$' then
        raise exception using errcode = '22023', message = 'attack season is invalid';
      end if;
      v_season := (v_item ->> 'season')::int;
      if v_season <> v_live_season then
        raise exception using errcode = '22023', message = 'live attack season does not match live.season';
      end if;

      if jsonb_typeof(v_item -> 'source_index') <> 'number'
         or (v_item ->> 'source_index') !~ '^(0|[1-9][0-9]*)$' then
        raise exception using errcode = '22023', message = 'attack source_index is invalid';
      end if;
      v_source_index := (v_item ->> 'source_index')::int;

      if jsonb_typeof(v_item -> 'day') <> 'number'
         or (v_item ->> 'day') !~ '^[12]$'
         or jsonb_typeof(v_item -> 'difficulty') <> 'number'
         or (v_item ->> 'difficulty') !~ '^[12]$' then
        raise exception using errcode = '22023', message = 'attack day or difficulty is invalid';
      end if;
      v_day := (v_item ->> 'day')::int;
      v_difficulty := (v_item ->> 'difficulty')::int;
      if v_day <> v_difficulty then
        raise exception using errcode = '22023', message = 'attack day and difficulty must match';
      end if;

      if jsonb_typeof(v_item -> 'step') <> 'number'
         or (v_item ->> 'step') !~ '^[1-5]$'
         or jsonb_typeof(v_item -> 'level') <> 'number'
         or (v_item ->> 'level') !~ '^[1-9][0-9]*$' then
        raise exception using errcode = '22023', message = 'attack step or level is invalid';
      end if;
      v_step := (v_item ->> 'step')::int;
      v_level := (v_item ->> 'level')::int;

      v_boss := btrim(coalesce(v_item ->> 'boss', ''));
      v_openid := btrim(coalesce(v_item ->> 'openid', ''));
      v_nickname := btrim(coalesce(v_item ->> 'nickname', ''));
      if v_boss = '' or v_openid = '' or v_nickname = '' then
        raise exception using errcode = '22023', message = 'attack identity is invalid';
      end if;

      if v_item ? 'element' and jsonb_typeof(v_item -> 'element') <> 'null' then
        if jsonb_typeof(v_item -> 'element') <> 'string'
           or btrim(v_item ->> 'element') = '' then
          raise exception using errcode = '22023', message = 'attack element is invalid';
        end if;
        v_element := btrim(v_item ->> 'element');
      end if;
      if v_item ? 'boss_id' and jsonb_typeof(v_item -> 'boss_id') <> 'null' then
        if jsonb_typeof(v_item -> 'boss_id') <> 'string'
           or btrim(v_item ->> 'boss_id') = '' then
          raise exception using errcode = '22023', message = 'attack boss_id is invalid';
        end if;
        v_boss_id := btrim(v_item ->> 'boss_id');
      end if;
      if v_item ? 'icon_id' and jsonb_typeof(v_item -> 'icon_id') <> 'null' then
        if jsonb_typeof(v_item -> 'icon_id') <> 'string'
           or btrim(v_item ->> 'icon_id') = '' then
          raise exception using errcode = '22023', message = 'attack icon_id is invalid';
        end if;
        v_attack_icon_id := btrim(v_item ->> 'icon_id');
      end if;

      if v_item ? 'sync_lv' and jsonb_typeof(v_item -> 'sync_lv') <> 'null' then
        if jsonb_typeof(v_item -> 'sync_lv') <> 'number'
           or (v_item ->> 'sync_lv') !~ '^[0-9]+$' then
          raise exception using errcode = '22023', message = 'attack sync_lv is invalid';
        end if;
        v_attack_sync_lv := (v_item ->> 'sync_lv')::int;
      end if;

      if jsonb_typeof(v_item -> 'total_damage') <> 'string'
         or (v_item ->> 'total_damage') !~ '^(0|[1-9][0-9]*)$'
         or length(v_item ->> 'total_damage') > 19
         or (v_item ->> 'total_damage')::numeric > 9223372036854775807 then
        raise exception using errcode = '22023', message = 'attack total_damage is invalid';
      end if;
      v_damage_text := v_item ->> 'total_damage';
      v_damage := v_damage_text::bigint;

      if jsonb_typeof(v_item -> 'is_final_hit') <> 'boolean' then
        raise exception using errcode = '22023', message = 'attack is_final_hit is invalid';
      end if;
      v_final_hit := (v_item ->> 'is_final_hit')::boolean;

      v_squad := v_item -> 'squad';
      if jsonb_typeof(v_squad) <> 'array'
         or jsonb_array_length(v_squad) not between 1 and 5 then
        raise exception using errcode = '22023', message = 'attack squad is invalid';
      end if;

      insert into public.members as m (
        area_id, guild_id, openid, nickname, is_active, first_seen, last_seen
      ) values (
        v_area_id, v_guild_id, v_openid, v_nickname, false, v_now, v_now
      )
      on conflict (area_id, guild_id, openid) do update
      set nickname = case when m.is_active then m.nickname else excluded.nickname end,
          last_seen = greatest(m.last_seen, excluded.last_seen);

      insert into public.attacks (
        area_id, guild_id, season, source_index, day, step, difficulty, level, boss,
        element, openid, nickname, sync_lv, total_damage, is_final_hit, squad,
        boss_id, icon_id, captured_at
      ) values (
        v_area_id, v_guild_id, v_season, v_source_index, v_day, v_step, v_difficulty, v_level, v_boss,
        v_element, v_openid, v_nickname, v_attack_sync_lv, v_damage, v_final_hit, v_squad,
        v_boss_id, v_attack_icon_id, v_now
      )
      on conflict (area_id, guild_id, season, source_index)
      do update set
        day = excluded.day,
        step = excluded.step,
        difficulty = excluded.difficulty,
        level = excluded.level,
        boss = excluded.boss,
        element = excluded.element,
        openid = excluded.openid,
        nickname = excluded.nickname,
        sync_lv = excluded.sync_lv,
        total_damage = excluded.total_damage,
        is_final_hit = excluded.is_final_hit,
        squad = excluded.squad,
        boss_id = excluded.boss_id,
        icon_id = excluded.icon_id
      returning (xmax = 0) into v_was_inserted;
      if v_was_inserted then
        v_inserted := v_inserted + 1;
      end if;
    end loop;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_payload -> 'settled_attacks')
  loop
    if jsonb_typeof(v_item) <> 'object'
       or v_item ? 'area_id'
       or v_item ? 'guild_id' then
      raise exception using errcode = '22023', message = 'settled attack is invalid';
    end if;

    v_season := null;
    v_source_index := null;
    v_day := null;
    v_step := null;
    v_difficulty := null;
    v_level := null;
    v_element := null;
    v_boss_id := null;
    v_attack_icon_id := null;
    v_attack_sync_lv := null;

    if jsonb_typeof(v_item -> 'season') <> 'number'
       or (v_item ->> 'season') !~ '^[1-9][0-9]*$' then
      raise exception using errcode = '22023', message = 'attack season is invalid';
    end if;
    v_season := (v_item ->> 'season')::int;

    if jsonb_typeof(v_item -> 'source_index') <> 'number'
       or (v_item ->> 'source_index') !~ '^(0|[1-9][0-9]*)$' then
      raise exception using errcode = '22023', message = 'attack source_index is invalid';
    end if;
    v_source_index := (v_item ->> 'source_index')::int;

    if jsonb_typeof(v_item -> 'day') <> 'number'
       or (v_item ->> 'day') !~ '^[12]$'
       or jsonb_typeof(v_item -> 'difficulty') <> 'number'
       or (v_item ->> 'difficulty') !~ '^[12]$' then
      raise exception using errcode = '22023', message = 'attack day or difficulty is invalid';
    end if;
    v_day := (v_item ->> 'day')::int;
    v_difficulty := (v_item ->> 'difficulty')::int;
    if v_day <> v_difficulty then
      raise exception using errcode = '22023', message = 'attack day and difficulty must match';
    end if;

    if jsonb_typeof(v_item -> 'step') <> 'number'
       or (v_item ->> 'step') !~ '^[1-5]$'
       or jsonb_typeof(v_item -> 'level') <> 'number'
       or (v_item ->> 'level') !~ '^[1-9][0-9]*$' then
      raise exception using errcode = '22023', message = 'attack step or level is invalid';
    end if;
    v_step := (v_item ->> 'step')::int;
    v_level := (v_item ->> 'level')::int;

    v_boss := btrim(coalesce(v_item ->> 'boss', ''));
    v_openid := btrim(coalesce(v_item ->> 'openid', ''));
    v_nickname := btrim(coalesce(v_item ->> 'nickname', ''));
    if v_boss = '' or v_openid = '' or v_nickname = '' then
      raise exception using errcode = '22023', message = 'attack identity is invalid';
    end if;

    if v_item ? 'element' and jsonb_typeof(v_item -> 'element') <> 'null' then
      if jsonb_typeof(v_item -> 'element') <> 'string'
         or btrim(v_item ->> 'element') = '' then
        raise exception using errcode = '22023', message = 'attack element is invalid';
      end if;
      v_element := btrim(v_item ->> 'element');
    end if;
    if v_item ? 'boss_id' and jsonb_typeof(v_item -> 'boss_id') <> 'null' then
      if jsonb_typeof(v_item -> 'boss_id') <> 'string'
         or btrim(v_item ->> 'boss_id') = '' then
        raise exception using errcode = '22023', message = 'attack boss_id is invalid';
      end if;
      v_boss_id := btrim(v_item ->> 'boss_id');
    end if;
    if v_item ? 'icon_id' and jsonb_typeof(v_item -> 'icon_id') <> 'null' then
      if jsonb_typeof(v_item -> 'icon_id') <> 'string'
         or btrim(v_item ->> 'icon_id') = '' then
        raise exception using errcode = '22023', message = 'attack icon_id is invalid';
      end if;
      v_attack_icon_id := btrim(v_item ->> 'icon_id');
    end if;

    if v_item ? 'sync_lv' and jsonb_typeof(v_item -> 'sync_lv') <> 'null' then
      if jsonb_typeof(v_item -> 'sync_lv') <> 'number'
         or (v_item ->> 'sync_lv') !~ '^[0-9]+$' then
        raise exception using errcode = '22023', message = 'attack sync_lv is invalid';
      end if;
      v_attack_sync_lv := (v_item ->> 'sync_lv')::int;
    end if;

    if jsonb_typeof(v_item -> 'total_damage') <> 'string'
       or (v_item ->> 'total_damage') !~ '^(0|[1-9][0-9]*)$'
       or length(v_item ->> 'total_damage') > 19
       or (v_item ->> 'total_damage')::numeric > 9223372036854775807 then
      raise exception using errcode = '22023', message = 'attack total_damage is invalid';
    end if;
    v_damage_text := v_item ->> 'total_damage';
    v_damage := v_damage_text::bigint;

    if jsonb_typeof(v_item -> 'is_final_hit') <> 'boolean' then
      raise exception using errcode = '22023', message = 'attack is_final_hit is invalid';
    end if;
    v_final_hit := (v_item ->> 'is_final_hit')::boolean;

    v_squad := v_item -> 'squad';
    if jsonb_typeof(v_squad) <> 'array'
       or jsonb_array_length(v_squad) not between 1 and 5 then
      raise exception using errcode = '22023', message = 'attack squad is invalid';
    end if;

    insert into public.members as m (
      area_id, guild_id, openid, nickname, is_active, first_seen, last_seen
    ) values (
      v_area_id, v_guild_id, v_openid, v_nickname, false, v_now, v_now
    )
    on conflict (area_id, guild_id, openid) do update
    set nickname = case when m.is_active then m.nickname else excluded.nickname end,
        last_seen = greatest(m.last_seen, excluded.last_seen);

    insert into public.attacks (
      area_id, guild_id, season, source_index, day, step, difficulty, level, boss,
      element, openid, nickname, sync_lv, total_damage, is_final_hit, squad,
      boss_id, icon_id, captured_at
    ) values (
      v_area_id, v_guild_id, v_season, v_source_index, v_day, v_step, v_difficulty, v_level, v_boss,
      v_element, v_openid, v_nickname, v_attack_sync_lv, v_damage, v_final_hit, v_squad,
      v_boss_id, v_attack_icon_id, v_now
    )
    on conflict (area_id, guild_id, season, source_index)
    do update set
      day = excluded.day,
      step = excluded.step,
      difficulty = excluded.difficulty,
      level = excluded.level,
      boss = excluded.boss,
      element = excluded.element,
      openid = excluded.openid,
      nickname = excluded.nickname,
      sync_lv = excluded.sync_lv,
      total_damage = excluded.total_damage,
      is_final_hit = excluded.is_final_hit,
      squad = excluded.squad,
      boss_id = excluded.boss_id,
      icon_id = excluded.icon_id
    returning (xmax = 0) into v_was_inserted;
    if v_was_inserted then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  if v_roster_state = 'complete' then
    update public.members as m
    set is_active = false
    where m.area_id = v_area_id
      and m.guild_id = v_guild_id
      and not (m.openid = any(v_roster_ids));
  end if;

  update public.guilds as g
  set name = coalesce(v_guild_name, g.name),
      member_count = coalesce(v_member_count, g.member_count),
      roster_state = v_roster_state,
      sync_state = 'ok',
      fail_count = 0,
      last_synced = v_now,
      sync_token = null,
      sync_lease_until = null,
      sync_trigger = null,
      last_error_code = null,
      last_error_at = null
  where g.area_id = v_area_id
    and g.guild_id = v_guild_id;

  insert into public.sync_log (
    area_id,
    guild_id,
    ran_at,
    ok,
    inserted,
    duration_ms,
    trigger,
    error_code,
    note
  ) values (
    v_area_id,
    v_guild_id,
    v_now,
    true,
    v_inserted,
    v_duration_ms,
    v_trigger,
    null,
    format(
      'roster=%s settled=%s live=%s replaced=%s',
      v_roster_state,
      v_settled_count,
      v_fresh_live_count,
      case when v_live_replaced then 'true' else 'false' end
    )
  );

  return query
  select true, 'applied'::text, 'ok'::text, v_inserted, v_live_replaced, v_roster_state;
end;
$$;

create or replace function public.fail_guild_sync(
  p_area_id int,
  p_guild_id text,
  p_token uuid,
  p_error_code text,
  p_safe_note text,
  p_duration_ms int,
  p_auth_required boolean
)
returns table (
  applied boolean,
  sync_state text,
  fail_count int
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_current_state text;
  v_current_token uuid;
  v_current_lease timestamptz;
  v_trigger text;
  v_fail_count int;
  v_next_state text;
  v_note text;
begin
  if p_area_id is null or p_guild_id is null or p_token is null then
    raise exception using errcode = '22023', message = 'area_id, guild_id, and token are required';
  end if;
  if p_error_code is null
     or p_error_code !~ '^[a-z0-9][a-z0-9_:-]{0,63}$' then
    raise exception using errcode = '22023', message = 'error_code is invalid';
  end if;
  if p_duration_ms is not null and p_duration_ms < 0 then
    raise exception using errcode = '22023', message = 'duration_ms is invalid';
  end if;
  if p_safe_note is not null
     and (
       length(p_safe_note) > 240
       or p_safe_note !~ '^[A-Za-z0-9_./:= -]+$'
     ) then
    raise exception using errcode = '22023', message = 'safe_note is invalid';
  end if;

  select
    g.sync_state,
    g.sync_token,
    g.sync_lease_until,
    g.sync_trigger,
    g.fail_count
  into
    v_current_state,
    v_current_token,
    v_current_lease,
    v_trigger,
    v_fail_count
  from public.guilds g
  where g.area_id = p_area_id
    and g.guild_id = p_guild_id
  for update;

  if not found
     or v_current_state <> 'syncing'
     or v_current_token is distinct from p_token
     or v_current_lease <= v_now then
    return query
    select false, coalesce(v_current_state, 'pending'), coalesce(v_fail_count, 0);
    return;
  end if;

  v_fail_count := v_fail_count + 1;
  v_next_state := case
    when coalesce(p_auth_required, false) then 'auth_required'
    when p_error_code = 'upstream_permission_denied' then 'dead'
    when v_fail_count >= 3 then 'dead'
    else 'pending'
  end;
  v_note := coalesce(nullif(btrim(p_safe_note), ''), 'error=' || p_error_code);

  update public.guilds as g
  set sync_state = v_next_state,
      fail_count = v_fail_count,
      sync_token = null,
      sync_lease_until = null,
      sync_trigger = null,
      last_error_code = p_error_code,
      last_error_at = v_now
  where g.area_id = p_area_id
    and g.guild_id = p_guild_id;

  insert into public.sync_log (
    area_id,
    guild_id,
    ran_at,
    ok,
    inserted,
    duration_ms,
    trigger,
    error_code,
    note
  ) values (
    p_area_id,
    p_guild_id,
    v_now,
    false,
    0,
    p_duration_ms,
    v_trigger,
    p_error_code,
    v_note
  );

  return query select true, v_next_state, v_fail_count;
end;
$$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove it
-- explicitly so browser roles cannot manufacture jobs or write collections.
revoke all on function public.register_or_touch_guild(int, text)
from public, anon, authenticated;
revoke all on function public.next_sync_batch(int)
from public, anon, authenticated;
revoke all on function public.claim_guild_sync(int, text, uuid, text, int)
from public, anon, authenticated;
revoke all on function public.apply_collection(jsonb, uuid)
from public, anon, authenticated;
revoke all on function public.fail_guild_sync(int, text, uuid, text, text, int, boolean)
from public, anon, authenticated;

grant execute on function public.register_or_touch_guild(int, text) to service_role;
grant execute on function public.next_sync_batch(int) to service_role;
grant execute on function public.claim_guild_sync(int, text, uuid, text, int) to service_role;
grant execute on function public.apply_collection(jsonb, uuid) to service_role;
grant execute on function public.fail_guild_sync(int, text, uuid, text, text, int, boolean) to service_role;

comment on function public.register_or_touch_guild(int, text) is
  'Service-only on-demand registration and last-viewed touch.';
comment on function public.next_sync_batch(int) is
  'Service-only bounded read of due sync jobs; reaps expired leases first.';
comment on function public.claim_guild_sync(int, text, uuid, text, int) is
  'Service-only atomic guild sync lease claim.';
comment on function public.apply_collection(jsonb, uuid) is
  'Service-only token-gated atomic application of normalized collection data.';
comment on function public.fail_guild_sync(int, text, uuid, text, text, int, boolean) is
  'Service-only token-gated failure transition with bounded safe audit metadata.';
