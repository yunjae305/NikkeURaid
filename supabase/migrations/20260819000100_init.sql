-- ============================================================================
--  NikkeURaid — 초기 스키마 (멀티테넌트)
--
--  설계 원칙
--   1. 모든 길드 데이터는 (area_id, guild_id) 로 격리된다.
--   2. 사람의 신원은 nickname 이 아니라 openid 다. 닉은 시점 스냅샷일 뿐.
--   3. 집계는 애플리케이션이 아니라 DB(뷰)가 한다.
--   4. 쓰기는 service_role(Edge Function)만. 클라이언트는 읽기 전용.
-- ============================================================================

-- ── 서버 지역 ────────────────────────────────────────────────────────────────
create table if not exists areas (
  area_id int primary key,
  name    text not null
);

insert into areas (area_id, name) values
  (81, '일본'), (82, '북미'), (83, '한국'), (84, '글로벌'), (85, '동남아')
on conflict (area_id) do nothing;

-- ── 길드 (테넌트) ────────────────────────────────────────────────────────────
--  sync_state
--    pending       최초 등록, 아직 수집 안 됨
--    syncing       수집 진행 중
--    ok            정상
--    auth_required 세션 만료 등 인증 문제로 조회 불가
--    dead          장기 미조회 또는 반복 실패 → 크론 대상에서 제외
create table if not exists guilds (
  area_id       int  not null references areas(area_id),
  guild_id      text not null,
  name          text,
  member_count  int,
  sync_state    text not null default 'pending'
                check (sync_state in ('pending','syncing','ok','auth_required','dead')),
  fail_count    int  not null default 0,
  first_seen    timestamptz not null default now(),
  last_viewed   timestamptz,          -- 크론 우선순위의 기준
  last_synced   timestamptz,
  primary key (area_id, guild_id)
);

-- 크론이 "다음에 갱신할 길드"를 고를 때 쓰는 인덱스
create index if not exists guilds_queue_idx
  on guilds (sync_state, last_synced nulls first)
  where sync_state <> 'dead';

-- ── 니케 마스터 (전역 공유) ──────────────────────────────────────────────────
--  tid_prefix = floor(squad.tid / 100). tid % 100 은 돌파/코강 등급.
create table if not exists nikkes (
  tid_prefix int primary key,
  name       text not null,
  name_en    text,
  short_name text,                    -- 길드에서 쓰는 축약어
  burst      text,                    -- '1' | '2' | '3' | 'A'
  element    text,                    -- 작열 / 수냉 / 풍압 / 전격 / 철갑
  img_code   text                     -- 'c513' → assets/nikke/si_c513_00_s.png
);

-- ── 길드원 ───────────────────────────────────────────────────────────────────
create table if not exists members (
  area_id   int  not null,
  guild_id  text not null,
  openid    text not null,
  nickname  text not null,
  alias     text,                     -- 길드에서 부르는 별명
  is_active boolean not null default true,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (area_id, guild_id, openid),
  foreign key (area_id, guild_id) references guilds(area_id, guild_id) on delete cascade
);

create index if not exists members_active_idx
  on members (area_id, guild_id) where is_active;

-- ── 공격 기록 (핵심 테이블) ──────────────────────────────────────────────────
--  squad 예시:
--    [{"slot":1,"tid":25301,"name":"크라운","lv":267,"break":"0돌","combat":81817}, …]
create table if not exists attacks (
  id           bigserial primary key,
  area_id      int  not null,
  guild_id     text not null,
  season       int  not null,          -- 차수 (season_id - 1000000)
  day          int  not null,          -- 1 = 일반, 2 = 하드
  step         int,                    -- 보스 위치 1~5
  difficulty   int,                    -- 1 = 일반, 2 = 하드
  level        int,                    -- 보스 단계 1~
  boss         text not null,
  element      text,
  openid       text not null,
  nickname     text not null,          -- 공격 시점의 닉 (스냅샷)
  sync_lv      int,
  total_damage bigint not null,
  is_final_hit boolean not null default false,
  squad        jsonb  not null default '[]'::jsonb,
  boss_id      text,
  icon_id      text,
  captured_at  timestamptz not null default now(),
  foreign key (area_id, guild_id) references guilds(area_id, guild_id) on delete cascade,
  -- 같은 사람이 같은 날 같은 보스에 정확히 같은 딜을 낼 확률은 무시 가능 → 중복 방지 키
  unique (area_id, guild_id, season, day, openid, boss, total_damage)
);

create index if not exists attacks_guild_season_idx on attacks (area_id, guild_id, season, day);
create index if not exists attacks_member_idx       on attacks (area_id, guild_id, openid);
create index if not exists attacks_boss_idx         on attacks (boss, season);
create index if not exists attacks_squad_gin        on attacks using gin (squad);

-- ── 보스 단계별 HP ───────────────────────────────────────────────────────────
--  max_hp 는 단계 고정값이라 최초 1회만 기록. current_hp / updated_at 만 갱신.
create table if not exists boss_levels (
  area_id    int  not null,
  guild_id   text not null,
  season     int  not null,
  difficulty int  not null,
  boss       text not null,
  level      int  not null,
  max_hp     bigint,
  current_hp bigint,
  element_id text,
  boss_id    text,
  icon_id    text,
  updated_at timestamptz not null default now(),
  primary key (area_id, guild_id, season, difficulty, boss, level),
  foreign key (area_id, guild_id) references guilds(area_id, guild_id) on delete cascade
);

-- ── 시즌 보스 배치 (전역, boss.json 시드) ────────────────────────────────────
create table if not exists season_bosses (
  season     int  not null,
  step       int  not null,
  name       text not null,
  weak       text,                     -- 약점 속성
  element_id text,
  img        text,                     -- assets/boss/<img>
  hp         bigint[],                 -- 단계별 HP
  primary key (season, step)
);

-- ── 난이도 계수 (전역, coef.json 시드) ───────────────────────────────────────
create table if not exists season_coef (
  season int not null,
  step   int not null,
  coef   numeric not null,
  primary key (season, step)
);

-- ── 운영 테이블 (클라이언트 접근 금지) ───────────────────────────────────────
create table if not exists auth_session (
  id         int primary key default 1 check (id = 1),
  cookie     text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists sync_log (
  id        bigserial primary key,
  area_id   int,
  guild_id  text,
  ran_at    timestamptz not null default now(),
  ok        boolean not null,
  inserted  int  not null default 0,
  duration_ms int,
  note      text
);

create index if not exists sync_log_recent_idx on sync_log (ran_at desc);

-- ============================================================================
--  RLS — 데이터는 공개 읽기, 쓰기는 service_role만. 운영 테이블은 완전 차단.
-- ============================================================================
alter table areas         enable row level security;
alter table guilds        enable row level security;
alter table nikkes        enable row level security;
alter table members       enable row level security;
alter table attacks       enable row level security;
alter table boss_levels   enable row level security;
alter table season_bosses enable row level security;
alter table season_coef   enable row level security;
alter table auth_session  enable row level security;
alter table sync_log      enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'areas','guilds','nikkes','members','attacks',
    'boss_levels','season_bosses','season_coef'
  ] loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_public_read', t
    );
  end loop;
end $$;

-- auth_session / sync_log 에는 정책을 만들지 않는다.
-- RLS 활성 + 정책 없음 = anon/authenticated 접근 전면 차단. service_role만 통과.
