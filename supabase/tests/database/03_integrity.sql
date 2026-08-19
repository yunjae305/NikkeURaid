begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = any(array[
        'guilds_member_count_nonnegative',
        'guilds_fail_count_nonnegative',
        'guilds_roster_state_valid',
        'nikkes_tid_prefix_positive',
        'attacks_season_positive',
        'attacks_day_valid',
        'attacks_step_valid',
        'attacks_difficulty_valid',
        'attacks_level_positive',
        'attacks_sync_lv_nonnegative',
        'attacks_total_damage_nonnegative',
        'attacks_squad_array',
        'boss_levels_season_positive',
        'boss_levels_difficulty_valid',
        'boss_levels_level_positive',
        'boss_levels_max_hp_nonnegative',
        'boss_levels_current_hp_nonnegative',
        'season_bosses_season_positive',
        'season_bosses_step_valid',
        'season_coef_season_positive',
        'season_coef_step_valid',
        'season_coef_positive',
        'sync_log_inserted_nonnegative',
        'sync_log_duration_ms_nonnegative'
      ])
  ),
  24,
  'all independent integrity constraints exist'
);

insert into public.guilds (area_id, guild_id, name, sync_state)
values (81, 'tap-integrity', 'Integrity', 'ok');

create temporary table tap_constraint_results (
  test_name text primary key,
  rejected boolean not null
) on commit drop;

do $$
begin
  begin
    insert into public.guilds (area_id, guild_id, member_count)
    values (81, 'tap-negative-members', -1);
    insert into tap_constraint_results values ('member_count', false);
  exception when check_violation then
    insert into tap_constraint_results values ('member_count', true);
  end;

  begin
    insert into public.guilds (area_id, guild_id, fail_count)
    values (81, 'tap-negative-fails', -1);
    insert into tap_constraint_results values ('fail_count', false);
  exception when check_violation then
    insert into tap_constraint_results values ('fail_count', true);
  end;

  begin
    insert into public.guilds (area_id, guild_id, roster_state)
    values (81, 'tap-invalid-roster', 'assumed');
    insert into tap_constraint_results values ('roster_state', false);
  exception when check_violation then
    insert into tap_constraint_results values ('roster_state', true);
  end;

  begin
    insert into public.attacks (
      area_id, guild_id, season, source_index, day, boss, openid, nickname, total_damage
    ) values (81, 'tap-integrity', 999, 0, 0, 'Boss', 'bad-day', 'Bad', 1);
    insert into tap_constraint_results values ('attack_day', false);
  exception when check_violation then
    insert into tap_constraint_results values ('attack_day', true);
  end;

  begin
    insert into public.attacks (
      area_id, guild_id, season, source_index, day, boss, openid, nickname, total_damage
    ) values (81, 'tap-integrity', 999, 0, 1, 'Boss', 'bad-damage', 'Bad', -1);
    insert into tap_constraint_results values ('attack_damage', false);
  exception when check_violation then
    insert into tap_constraint_results values ('attack_damage', true);
  end;

  begin
    insert into public.attacks (
      area_id, guild_id, season, source_index, day, boss, openid, nickname,
      total_damage, squad
    ) values (
      81, 'tap-integrity', 999, 0, 1, 'Boss', 'bad-squad', 'Bad', 1,
      '{"name":"not-an-array"}'::jsonb
    );
    insert into tap_constraint_results values ('attack_squad', false);
  exception when check_violation then
    insert into tap_constraint_results values ('attack_squad', true);
  end;

  begin
    insert into public.boss_levels (
      area_id, guild_id, season, difficulty, boss, level, current_hp
    ) values (81, 'tap-integrity', 999, 1, 'Boss', 1, -1);
    insert into tap_constraint_results values ('boss_hp', false);
  exception when check_violation then
    insert into tap_constraint_results values ('boss_hp', true);
  end;

  begin
    insert into public.season_bosses (season, step, name)
    values (999, 6, 'Boss');
    insert into tap_constraint_results values ('season_boss_step', false);
  exception when check_violation then
    insert into tap_constraint_results values ('season_boss_step', true);
  end;

  begin
    insert into public.season_coef (season, step, coef)
    values (999, 1, 0);
    insert into tap_constraint_results values ('season_coef', false);
  exception when check_violation then
    insert into tap_constraint_results values ('season_coef', true);
  end;

  begin
    insert into public.sync_log (ok, duration_ms)
    values (true, -1);
    insert into tap_constraint_results values ('sync_duration', false);
  exception when check_violation then
    insert into tap_constraint_results values ('sync_duration', true);
  end;
end
$$;

select ok((select rejected from tap_constraint_results where test_name = 'member_count'), 'negative member_count is rejected');
select ok((select rejected from tap_constraint_results where test_name = 'fail_count'), 'negative fail_count is rejected');
select ok((select rejected from tap_constraint_results where test_name = 'roster_state'), 'an unknown roster state is rejected');
select ok((select rejected from tap_constraint_results where test_name = 'attack_day'), 'an out-of-range raid day is rejected');
select ok((select rejected from tap_constraint_results where test_name = 'attack_damage'), 'negative damage is rejected');
select ok((select rejected from tap_constraint_results where test_name = 'attack_squad'), 'a non-array squad is rejected');
select ok((select rejected from tap_constraint_results where test_name = 'boss_hp'), 'negative boss HP is rejected');
select ok((select rejected from tap_constraint_results where test_name = 'season_boss_step'), 'an out-of-range season boss step is rejected');
select ok((select rejected from tap_constraint_results where test_name = 'season_coef'), 'a non-positive season coefficient is rejected');
select ok((select rejected from tap_constraint_results where test_name = 'sync_duration'), 'a negative sync duration is rejected');

insert into public.boss_levels (
  area_id, guild_id, season, difficulty, boss, level, max_hp, current_hp
) values (81, 'tap-integrity', 999, 1, 'Async Boss', 1, 100, 200);

select ok(
  exists(
    select 1
    from public.boss_levels
    where guild_id = 'tap-integrity'
      and boss = 'Async Boss'
      and current_hp > max_hp
  ),
  'independent HP checks tolerate temporarily out-of-sync responses'
);

select * from finish();
rollback;
