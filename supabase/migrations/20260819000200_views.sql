-- ============================================================================
--  집계 뷰 — 대시보드 화면 하나당 뷰 하나.
--  원본 nikkeRaid 는 이 계산을 Apps Script 1,600여 줄로 했다. 여기서는 SQL이 한다.
-- ============================================================================

-- ── 멤버 × 시즌 × 일자 집계 ──────────────────────────────────────────────────
--  쓰임: 딜 순위, 기여도
create or replace view v_member_daily as
select
  a.area_id,
  a.guild_id,
  a.season,
  a.day,
  a.openid,
  max(a.nickname)                                       as nickname,
  count(*)                                              as tries,
  sum(a.total_damage)                                   as damage,
  max(a.total_damage)                                   as best_hit,
  max(a.sync_lv)                                        as sync_lv,
  count(*) filter (where a.is_final_hit)                as final_hits,
  round(100.0 * sum(a.total_damage)
        / nullif(sum(sum(a.total_damage)) over (
            partition by a.area_id, a.guild_id, a.season, a.day
          ), 0), 2)                                     as contribution_pct
from attacks a
group by a.area_id, a.guild_id, a.season, a.day, a.openid;

-- ── 참여 현황 (미참여 체크) ──────────────────────────────────────────────────
--  쓰임: "오늘 티켓 안 쓴 사람" — 총무가 가장 자주 보는 화면.
--  현재 길드원 명단(members)을 기준으로 LEFT JOIN 하므로,
--  기록이 아예 없는 사람도 0/3 으로 잡힌다. (기록만 보면 이 사람들이 사라진다)
create or replace view v_participation as
select
  m.area_id,
  m.guild_id,
  s.season,
  s.day,
  m.openid,
  coalesce(m.alias, m.nickname)      as display_name,
  m.nickname,
  coalesce(d.tries, 0)               as tries,
  3 - coalesce(d.tries, 0)           as remaining,
  coalesce(d.damage, 0)              as damage
from members m
join (select distinct area_id, guild_id, season, day from attacks) s
  on s.area_id = m.area_id and s.guild_id = m.guild_id
left join v_member_daily d
       on d.area_id = m.area_id and d.guild_id = m.guild_id
      and d.openid  = m.openid
      and d.season  = s.season  and d.day = s.day
where m.is_active;

-- ── 시즌 총계 ────────────────────────────────────────────────────────────────
--  쓰임: 시즌 추이 그래프, 개요 상단 타일
create or replace view v_season_totals as
select
  area_id,
  guild_id,
  season,
  sum(total_damage)                        as damage,
  count(*)                                 as attacks,
  count(distinct openid)                   as participants,
  count(distinct boss)                     as bosses,
  max(captured_at)                         as last_attack_at
from attacks
group by area_id, guild_id, season;

-- ── 조합 통계 ────────────────────────────────────────────────────────────────
--  쓰임: 보스별 어떤 파티가 잘 나오는지.
--  squad(jsonb) 를 펼쳐 이름을 정렬 배열로 만들어 조합 키로 쓴다.
--  → 슬롯 순서가 달라도 같은 조합으로 묶인다.
create or replace view v_combo_stats as
select
  a.area_id,
  a.guild_id,
  a.season,
  a.boss,
  a.difficulty,
  c.combo,
  count(*)                                 as n,
  avg(a.total_damage)::bigint              as avg_damage,
  max(a.total_damage)                      as max_damage,
  min(a.total_damage)                      as min_damage,
  avg(a.sync_lv)::int                      as avg_sync_lv
from attacks a
cross join lateral (
  select array_agg(e ->> 'name' order by e ->> 'name') as combo
  from jsonb_array_elements(a.squad) e
  where e ->> 'name' is not null
) c
where c.combo is not null
group by a.area_id, a.guild_id, a.season, a.boss, a.difficulty, c.combo;

-- ── 니케별 출전/성적 ─────────────────────────────────────────────────────────
--  쓰임: "이 니케를 넣은 공격은 평균 얼마나 나오나", 조합 필터 칩
create or replace view v_nikke_usage as
select
  a.area_id,
  a.guild_id,
  a.season,
  a.boss,
  e ->> 'name'                             as nikke,
  count(*)                                 as picks,
  avg(a.total_damage)::bigint              as avg_damage
from attacks a
cross join lateral jsonb_array_elements(a.squad) e
where e ->> 'name' is not null
group by a.area_id, a.guild_id, a.season, a.boss, e ->> 'name';

-- ── 개인 성장 추이 ───────────────────────────────────────────────────────────
--  쓰임: 차수 대비 개인 성장률. 참여하지 않은 차수는 자동으로 빠진다.
create or replace view v_member_growth as
select
  area_id,
  guild_id,
  openid,
  max(nickname)                            as nickname,
  season,
  sum(total_damage)                        as damage,
  max(sync_lv)                             as sync_lv,
  lag(sum(total_damage)) over (
    partition by area_id, guild_id, openid order by season
  )                                        as prev_damage
from attacks
group by area_id, guild_id, openid, season;

-- ── 크론 우선순위 큐 ─────────────────────────────────────────────────────────
--  전 길드를 5분마다 도는 건 불가능하다. 조회된 지 오래된 길드일수록 뒤로 민다.
--    최근 10분 내 조회   → 5분마다
--    최근 3일 내 조회    → 30분마다
--    그 외               → 6시간마다
create or replace view v_sync_queue as
select
  g.area_id,
  g.guild_id,
  g.name,
  g.last_synced,
  g.last_viewed,
  case
    when g.last_viewed > now() - interval '10 minutes' then interval '5 minutes'
    when g.last_viewed > now() - interval '3 days'     then interval '30 minutes'
    else                                                    interval '6 hours'
  end                                      as sync_interval
from guilds g
where g.sync_state not in ('dead', 'syncing')
  and (
    g.last_synced is null
    or g.last_synced < now() - case
         when g.last_viewed > now() - interval '10 minutes' then interval '5 minutes'
         when g.last_viewed > now() - interval '3 days'     then interval '30 minutes'
         else                                                    interval '6 hours'
       end
  )
order by g.last_synced nulls first;
