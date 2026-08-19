-- 자동 생성됨: scripts/generate_seed.py — 직접 수정하지 말 것
-- 난이도 계수. 매 시즌 수동 갱신이 필요하다(운영자 화면에서 편집).
insert into season_coef (season, step, coef) values
  (40, 1, 0.8733),
  (40, 2, 0.9357),
  (40, 3, 1.2104),
  (40, 4, 1.1228),
  (40, 5, 0.8704)
on conflict (season, step) do update set coef = excluded.coef;
