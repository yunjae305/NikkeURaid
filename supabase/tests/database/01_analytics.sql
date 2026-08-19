begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(38);

insert into public.guilds (area_id, guild_id, name, sync_state) values
  (81, 'tap-isolation', 'Isolation JP', 'ok'),
  (82, 'tap-isolation', 'Isolation NA', 'ok'),
  (81, 'tap-aggregate', 'Aggregate', 'ok'),
  (81, 'tap-rename', 'Rename', 'ok'),
  (81, 'tap-combo', 'Combo', 'ok'),
  (81, 'tap-usage', 'Usage', 'ok'),
  (81, 'tap-growth', 'Growth', 'ok');

insert into public.members (
  area_id, guild_id, openid, nickname, alias, is_active
) values
  (81, 'tap-isolation', 'same-user', 'JP user', null, true),
  (82, 'tap-isolation', 'same-user', 'NA user', null, true),
  (81, 'tap-aggregate', 'alice', 'Alice', null, true),
  (81, 'tap-aggregate', 'bob', 'Bob', 'Captain', true),
  (81, 'tap-aggregate', 'charlie', 'Charlie', null, true),
  (81, 'tap-aggregate', 'inactive', 'Inactive', null, false),
  (81, 'tap-rename', 'tracked', 'CurrentNick', null, true),
  (81, 'tap-growth', 'grower', 'GrowthCurrent', null, true);

-- Same guild_id and openid in two regions must remain completely isolated.
insert into public.attacks (
  area_id, guild_id, season, source_index, day, boss, openid, nickname,
  total_damage, captured_at
) values
  (81, 'tap-isolation', 900, 0, 1, 'Boss', 'same-user', 'JP old', 111, '2026-01-01 00:00:00+00'),
  (82, 'tap-isolation', 900, 0, 1, 'Boss', 'same-user', 'NA old', 999, '2026-01-01 00:00:00+00');

select is(
  (
    select damage
    from public.v_member_daily
    where area_id = 81 and guild_id = 'tap-isolation' and openid = 'same-user'
  ),
  111::numeric,
  'daily damage is isolated by area and guild'
);

select is(
  (
    select damage
    from public.v_member_daily
    where area_id = 82 and guild_id = 'tap-isolation' and openid = 'same-user'
  ),
  999::numeric,
  'the matching guild id in another area has its own aggregate'
);

select is(
  (
    select count(*)::int
    from public.v_member_daily
    where guild_id = 'tap-isolation' and openid = 'same-user'
  ),
  2,
  'the two regional identities remain two rows'
);

-- Aggregate fixture: Alice uses four tickets, Bob one, Charlie none.
insert into public.attacks (
  area_id, guild_id, season, source_index, day, boss, openid, nickname, sync_lv,
  total_damage, is_final_hit, captured_at
) values
  (81, 'tap-aggregate', 901, 0, 1, 'Boss A', 'alice', 'Alice old', 200, 100, false, '2026-01-02 00:00:00+00'),
  (81, 'tap-aggregate', 901, 1, 1, 'Boss B', 'alice', 'Alice old', 250, 300, true,  '2026-01-02 00:01:00+00'),
  (81, 'tap-aggregate', 901, 2, 1, 'Boss C', 'alice', 'Alice old', 230, 50,  false, '2026-01-02 00:02:00+00'),
  (81, 'tap-aggregate', 901, 3, 1, 'Boss D', 'alice', 'Alice old', 240, 50,  false, '2026-01-02 00:03:00+00'),
  (81, 'tap-aggregate', 901, 4, 1, 'Boss A', 'bob',   'Bob old',   210, 500, false, '2026-01-02 00:04:00+00');

select is(
  (select tries from public.v_member_daily where guild_id = 'tap-aggregate' and openid = 'alice'),
  4::bigint,
  'daily view counts attempts'
);

select is(
  (select damage from public.v_member_daily where guild_id = 'tap-aggregate' and openid = 'alice'),
  500::numeric,
  'daily view sums damage'
);

select is(
  (select best_hit from public.v_member_daily where guild_id = 'tap-aggregate' and openid = 'alice'),
  300::bigint,
  'daily view finds the best hit'
);

select is(
  (select sync_lv from public.v_member_daily where guild_id = 'tap-aggregate' and openid = 'alice'),
  250,
  'daily view keeps the maximum sync level'
);

select is(
  (select final_hits from public.v_member_daily where guild_id = 'tap-aggregate' and openid = 'alice'),
  1::bigint,
  'daily view counts final hits'
);

select is(
  (select contribution_pct from public.v_member_daily where guild_id = 'tap-aggregate' and openid = 'alice'),
  50.00::numeric,
  'daily contribution uses the isolated guild/day total'
);

select is(
  (select remaining from public.v_participation where guild_id = 'tap-aggregate' and openid = 'alice'),
  0::bigint,
  'remaining tickets clamp at zero after more than three attempts'
);

select is(
  (select tries from public.v_participation where guild_id = 'tap-aggregate' and openid = 'charlie'),
  0::bigint,
  'an active member without attacks is retained with zero tries'
);

select is(
  (select remaining from public.v_participation where guild_id = 'tap-aggregate' and openid = 'charlie'),
  3::bigint,
  'an active member without attacks has all three tickets left'
);

select is(
  (
    select count(*)::int
    from public.v_participation
    where guild_id = 'tap-aggregate' and openid = 'inactive'
  ),
  0,
  'inactive members are excluded from participation'
);

select is(
  (select display_name from public.v_participation where guild_id = 'tap-aggregate' and openid = 'bob'),
  'Captain',
  'participation prefers a configured alias'
);

select is(
  (select damage from public.v_season_totals where guild_id = 'tap-aggregate' and season = 901),
  1000::numeric,
  'season totals sum damage'
);

select is(
  (select attacks from public.v_season_totals where guild_id = 'tap-aggregate' and season = 901),
  5::bigint,
  'season totals count attacks'
);

select is(
  (select participants from public.v_season_totals where guild_id = 'tap-aggregate' and season = 901),
  2::bigint,
  'season totals count distinct participants'
);

select is(
  (select bosses from public.v_season_totals where guild_id = 'tap-aggregate' and season = 901),
  4::bigint,
  'season totals count distinct bosses'
);

-- Roster names win; without a roster row the newest captured snapshot wins.
insert into public.attacks (
  area_id, guild_id, season, source_index, day, boss, openid, nickname,
  total_damage, captured_at
) values
  (81, 'tap-rename', 910, 0, 1, 'Boss A', 'tracked', 'ZuluOld',    100, '2026-02-01 00:00:00+00'),
  (81, 'tap-rename', 910, 1, 1, 'Boss B', 'tracked', 'AlphaNew',  200, '2026-02-02 00:00:00+00'),
  (81, 'tap-rename', 910, 2, 1, 'Boss A', 'orphan',  'ZuluOld',    50, '2026-02-01 00:00:00+00'),
  (81, 'tap-rename', 910, 3, 1, 'Boss B', 'orphan',  'AlphaLatest', 75, '2026-02-02 00:00:00+00');

select is(
  (select nickname from public.v_member_daily where guild_id = 'tap-rename' and openid = 'tracked'),
  'CurrentNick',
  'daily view uses the current roster nickname after a rename'
);

select is(
  (select nickname from public.v_member_growth where guild_id = 'tap-rename' and openid = 'tracked'),
  'CurrentNick',
  'growth view uses the current roster nickname after a rename'
);

select is(
  (select nickname from public.v_member_daily where guild_id = 'tap-rename' and openid = 'orphan'),
  'AlphaLatest',
  'daily view falls back to the latest captured nickname, not max(text)'
);

select is(
  (select nickname from public.v_member_growth where guild_id = 'tap-rename' and openid = 'orphan'),
  'AlphaLatest',
  'growth view falls back to the latest captured nickname, not max(text)'
);

-- Squad ordering is normalized into one combo key.
insert into public.attacks (
  area_id, guild_id, season, source_index, day, boss, difficulty, openid, nickname,
  total_damage, squad, captured_at
) values
  (
    81, 'tap-combo', 920, 0, 1, 'Combo Boss', 1, 'combo-1', 'One', 100,
    '[{"slot":1,"name":"Alice"},{"slot":2,"name":"Beth"}]'::jsonb,
    '2026-03-01 00:00:00+00'
  ),
  (
    81, 'tap-combo', 920, 1, 1, 'Combo Boss', 1, 'combo-2', 'Two', 300,
    '[{"slot":1,"name":"Beth"},{"slot":2,"name":"Alice"}]'::jsonb,
    '2026-03-01 00:01:00+00'
  );

select is(
  (select count(*)::int from public.v_combo_stats where guild_id = 'tap-combo'),
  1,
  'reversed squad order produces one combo row'
);

select is(
  (select n from public.v_combo_stats where guild_id = 'tap-combo'),
  2::bigint,
  'combo stats count both attacks'
);

select is(
  (select avg_damage from public.v_combo_stats where guild_id = 'tap-combo'),
  200::bigint,
  'combo stats average damage'
);

select is(
  (select max_damage from public.v_combo_stats where guild_id = 'tap-combo'),
  300::bigint,
  'combo stats maximum damage'
);

select is(
  (select min_damage from public.v_combo_stats where guild_id = 'tap-combo'),
  100::bigint,
  'combo stats minimum damage'
);

select is(
  (select count(*)::int from public.v_nikke_usage where guild_id = 'tap-combo'),
  2,
  'usage view has one row per distinct Nikke'
);

select is(
  (select picks from public.v_nikke_usage where guild_id = 'tap-combo' and nikke = 'Alice'),
  2::bigint,
  'usage view counts Alice in both squads'
);

select is(
  (select avg_damage from public.v_nikke_usage where guild_id = 'tap-combo' and nikke = 'Alice'),
  200::bigint,
  'usage view averages damage for a selected Nikke'
);

-- Usage rows retain their day and difficulty so the dashboard cannot mix them.
insert into public.attacks (
  area_id, guild_id, season, source_index, day, boss, difficulty, openid, nickname,
  total_damage, squad, captured_at
) values
  (
    81, 'tap-usage', 921, 0, 1, 'Usage Boss', 1, 'usage-normal', 'Normal', 100,
    '[{"slot":1,"name":"Alice"}]'::jsonb,
    '2026-03-02 00:00:00+00'
  ),
  (
    81, 'tap-usage', 921, 1, 2, 'Usage Boss', 2, 'usage-hard', 'Hard', 900,
    '[{"slot":1,"name":"Alice"}]'::jsonb,
    '2026-03-03 00:00:00+00'
  );

select is(
  (select count(*)::int from public.v_nikke_usage where guild_id = 'tap-usage'),
  2,
  'usage view keeps normal and hard days as separate rows'
);

select is(
  (select picks from public.v_nikke_usage where guild_id = 'tap-usage' and day = 1 and difficulty = 1),
  1::bigint,
  'normal-day usage can be selected independently'
);

select is(
  (select avg_damage from public.v_nikke_usage where guild_id = 'tap-usage' and day = 1 and difficulty = 1),
  100::bigint,
  'normal-day usage keeps only normal damage'
);

select is(
  (select avg_damage from public.v_nikke_usage where guild_id = 'tap-usage' and day = 2 and difficulty = 2),
  900::bigint,
  'hard-day usage keeps only hard damage'
);

-- Growth compares the previous participating season, even if season ids skip.
insert into public.attacks (
  area_id, guild_id, season, source_index, day, boss, openid, nickname,
  sync_lv, total_damage, captured_at
) values
  (81, 'tap-growth', 930, 0, 1, 'Boss', 'grower', 'OldName', 200, 100, '2026-04-01 00:00:00+00'),
  (81, 'tap-growth', 932, 0, 1, 'Boss', 'grower', 'OlderName', 250, 250, '2026-04-02 00:00:00+00');

select is(
  (select count(*)::int from public.v_member_growth where guild_id = 'tap-growth' and openid = 'grower'),
  2,
  'growth view has one row per participating season'
);

select is(
  (select damage from public.v_member_growth where guild_id = 'tap-growth' and openid = 'grower' and season = 932),
  250::numeric,
  'growth view reports current-season damage'
);

select is(
  (select prev_damage from public.v_member_growth where guild_id = 'tap-growth' and openid = 'grower' and season = 932),
  100::numeric,
  'growth lag uses the previous participating season'
);

select is(
  (select nickname from public.v_member_growth where guild_id = 'tap-growth' and openid = 'grower' and season = 932),
  'GrowthCurrent',
  'growth rows keep the current roster nickname'
);

select * from finish();
rollback;
