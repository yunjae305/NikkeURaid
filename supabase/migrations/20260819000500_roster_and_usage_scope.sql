-- A guild can be visible through raid history while its full member roster is
-- unavailable. Persist that distinction so the dashboard never presents a
-- partial roster as proof that everybody used their tickets.
alter table public.guilds
  add column roster_state text not null default 'unknown';

alter table public.guilds
  add constraint guilds_roster_state_valid
  check (roster_state in ('unknown', 'complete', 'limited'));

-- Usage belongs to the selected raid day/difficulty. The original view mixed
-- normal and hard attacks, which made a Day 1 dashboard show Day 2 picks.
create or replace view public.v_nikke_usage as
select
  a.area_id,
  a.guild_id,
  a.season,
  a.boss,
  e ->> 'name'                             as nikke,
  count(*)                                 as picks,
  avg(a.total_damage)::bigint              as avg_damage,
  a.day,
  a.difficulty
from public.attacks a
cross join lateral jsonb_array_elements(a.squad) e
where e ->> 'name' is not null
group by
  a.area_id,
  a.guild_id,
  a.season,
  a.boss,
  e ->> 'name',
  a.day,
  a.difficulty;

alter view public.v_nikke_usage set (security_invoker = true);
grant select on public.v_nikke_usage to anon, authenticated, service_role;
