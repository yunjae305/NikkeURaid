-- Harden the read boundary before collection and scheduling are implemented.
-- Public API roles can read product data and analytics only. Collector state is
-- available only to service_role.

-- Use the current member nickname when the guild roster is available. For an
-- attacker absent from the roster, use the most recently captured snapshot
-- instead of the lexicographically greatest nickname.
create or replace view public.v_member_daily as
select
  a.area_id,
  a.guild_id,
  a.season,
  a.day,
  a.openid,
  coalesce(
    m.nickname,
    (array_agg(a.nickname order by a.captured_at desc, a.id desc))[1]
  )                                                       as nickname,
  count(*)                                                as tries,
  sum(a.total_damage)                                     as damage,
  max(a.total_damage)                                     as best_hit,
  max(a.sync_lv)                                          as sync_lv,
  count(*) filter (where a.is_final_hit)                  as final_hits,
  round(
    100.0 * sum(a.total_damage)
    / nullif(
        sum(sum(a.total_damage)) over (
          partition by a.area_id, a.guild_id, a.season, a.day
        ),
        0
      ),
    2
  )                                                       as contribution_pct
from public.attacks a
left join public.members m
  on m.area_id = a.area_id
 and m.guild_id = a.guild_id
 and m.openid = a.openid
group by
  a.area_id,
  a.guild_id,
  a.season,
  a.day,
  a.openid,
  m.nickname;

-- Extra or duplicated upstream records must never make the UI show a negative
-- ticket count.
create or replace view public.v_participation as
select
  m.area_id,
  m.guild_id,
  s.season,
  s.day,
  m.openid,
  coalesce(m.alias, m.nickname)                    as display_name,
  m.nickname,
  coalesce(d.tries, 0)                             as tries,
  greatest(3 - coalesce(d.tries, 0), 0::bigint)   as remaining,
  coalesce(d.damage, 0)                            as damage
from public.members m
join (
  select distinct area_id, guild_id, season, day
  from public.attacks
) s
  on s.area_id = m.area_id
 and s.guild_id = m.guild_id
left join public.v_member_daily d
  on d.area_id = m.area_id
 and d.guild_id = m.guild_id
 and d.openid = m.openid
 and d.season = s.season
 and d.day = s.day
where m.is_active;

create or replace view public.v_member_growth as
select
  a.area_id,
  a.guild_id,
  a.openid,
  coalesce(
    m.nickname,
    (array_agg(a.nickname order by a.captured_at desc, a.id desc))[1]
  )                                                       as nickname,
  a.season,
  sum(a.total_damage)                                     as damage,
  max(a.sync_lv)                                          as sync_lv,
  lag(sum(a.total_damage)) over (
    partition by a.area_id, a.guild_id, a.openid
    order by a.season
  )                                                       as prev_damage
from public.attacks a
left join public.members m
  on m.area_id = a.area_id
 and m.guild_id = a.guild_id
 and m.openid = a.openid
group by
  a.area_id,
  a.guild_id,
  a.openid,
  m.nickname,
  a.season;

-- Only schedulable states belong in the queue. auth_required must stay parked
-- until an operator refreshes the upstream session.
create or replace view public.v_sync_queue as
select
  g.area_id,
  g.guild_id,
  g.name,
  g.last_synced,
  g.last_viewed,
  case
    when g.last_viewed > now() - interval '10 minutes' then interval '5 minutes'
    when g.last_viewed > now() - interval '3 days' then interval '30 minutes'
    else interval '6 hours'
  end                                                     as sync_interval
from public.guilds g
where g.sync_state in ('pending', 'ok')
  -- A later page view updates last_viewed and lets the guild re-enter the queue.
  and coalesce(g.last_viewed, g.first_seen) >= now() - interval '90 days'
  and (
    g.last_synced is null
    or g.last_synced < now() - case
      when g.last_viewed > now() - interval '10 minutes' then interval '5 minutes'
      when g.last_viewed > now() - interval '3 days' then interval '30 minutes'
      else interval '6 hours'
    end
  )
order by g.last_synced nulls first;

-- Invoker security makes every view obey the caller's grants and the RLS
-- policies of its base tables.
alter view public.v_member_daily set (security_invoker = true);
alter view public.v_participation set (security_invoker = true);
alter view public.v_season_totals set (security_invoker = true);
alter view public.v_combo_stats set (security_invoker = true);
alter view public.v_nikke_usage set (security_invoker = true);
alter view public.v_member_growth set (security_invoker = true);
alter view public.v_sync_queue set (security_invoker = true);

-- These checks validate one input independently of other fields. They avoid
-- assumptions such as current_hp <= max_hp that can be temporarily false while
-- separate upstream responses are being refreshed.
alter table public.guilds
  add constraint guilds_member_count_nonnegative
    check (member_count is null or member_count >= 0),
  add constraint guilds_fail_count_nonnegative
    check (fail_count >= 0);

alter table public.nikkes
  add constraint nikkes_tid_prefix_positive
    check (tid_prefix > 0);

alter table public.attacks
  add constraint attacks_season_positive
    check (season > 0),
  add constraint attacks_day_valid
    check (day between 1 and 2),
  add constraint attacks_step_valid
    check (step is null or step between 1 and 5),
  add constraint attacks_difficulty_valid
    check (difficulty is null or difficulty between 1 and 2),
  add constraint attacks_level_positive
    check (level is null or level > 0),
  add constraint attacks_sync_lv_nonnegative
    check (sync_lv is null or sync_lv >= 0),
  add constraint attacks_total_damage_nonnegative
    check (total_damage >= 0),
  add constraint attacks_squad_array
    check (jsonb_typeof(squad) = 'array');

alter table public.boss_levels
  add constraint boss_levels_season_positive
    check (season > 0),
  add constraint boss_levels_difficulty_valid
    check (difficulty between 1 and 2),
  add constraint boss_levels_level_positive
    check (level > 0),
  add constraint boss_levels_max_hp_nonnegative
    check (max_hp is null or max_hp >= 0),
  add constraint boss_levels_current_hp_nonnegative
    check (current_hp is null or current_hp >= 0);

alter table public.season_bosses
  add constraint season_bosses_season_positive
    check (season > 0),
  add constraint season_bosses_step_valid
    check (step between 1 and 5);

alter table public.season_coef
  add constraint season_coef_season_positive
    check (season > 0),
  add constraint season_coef_step_valid
    check (step between 1 and 5),
  add constraint season_coef_positive
    check (coef > 0);

alter table public.sync_log
  add constraint sync_log_inserted_nonnegative
    check (inserted >= 0),
  add constraint sync_log_duration_ms_nonnegative
    check (duration_ms is null or duration_ms >= 0);

-- Remove any inherited/default API grants first, then declare the intended
-- boundary explicitly.
revoke all privileges on table
  public.areas,
  public.guilds,
  public.nikkes,
  public.members,
  public.attacks,
  public.boss_levels,
  public.season_bosses,
  public.season_coef,
  public.auth_session,
  public.sync_log
from public, anon, authenticated, service_role;

revoke all privileges on table
  public.v_member_daily,
  public.v_participation,
  public.v_season_totals,
  public.v_combo_stats,
  public.v_nikke_usage,
  public.v_member_growth,
  public.v_sync_queue
from public, anon, authenticated, service_role;

revoke all privileges on all sequences in schema public
from public, anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

grant select on table
  public.areas,
  public.guilds,
  public.nikkes,
  public.members,
  public.attacks,
  public.boss_levels,
  public.season_bosses,
  public.season_coef
to anon, authenticated;

grant select on table
  public.v_member_daily,
  public.v_participation,
  public.v_season_totals,
  public.v_combo_stats,
  public.v_nikke_usage,
  public.v_member_growth
to anon, authenticated;

grant select, insert, update, delete on table
  public.areas,
  public.guilds,
  public.nikkes,
  public.members,
  public.attacks,
  public.boss_levels,
  public.season_bosses,
  public.season_coef,
  public.auth_session,
  public.sync_log
to service_role;

grant select on table
  public.v_member_daily,
  public.v_participation,
  public.v_season_totals,
  public.v_combo_stats,
  public.v_nikke_usage,
  public.v_member_growth,
  public.v_sync_queue
to service_role;

grant usage, select, update on all sequences in schema public
to service_role;
