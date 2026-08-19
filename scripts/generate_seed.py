#!/usr/bin/env python3
"""
data/ 의 원본 파일에서 supabase/seed/*.sql 을 생성한다.

  python3 scripts/generate_seed.py

입력
  data/nikkes.csv    버스트, 코드(속성), 이름, 영문명, 파일명, 줄임말
  data/resmap.json   tid_prefix -> resource_id   ("1018": 18)
  data/bosses.json   시즌별 보스 배치 + 단계 HP
  data/coef.json     시즌·step 난이도 계수

출력
  supabase/seed/01_nikkes.sql
  supabase/seed/02_season_bosses.sql
  supabase/seed/03_season_coef.sql

resource_id 와 CSV 의 '파일명'(cNNN)은 같은 것을 가리킨다.
  tid 25301 -> tid_prefix 253 -> resource_id 253 -> 'c253'
     -> assets/nikke/si_c253_00_s.png
"""

import csv
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "supabase" / "seed"


def q(v):
    """SQL 리터럴로 인용. None -> NULL"""
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def load_nikkes():
    resmap = json.loads((DATA / "resmap.json").read_text(encoding="utf-8"))
    # resource_id -> tid_prefix 로 뒤집는다 (CSV 는 resource 기준이라)
    by_res = {}
    for tid_prefix, res_id in resmap.items():
        by_res.setdefault(int(res_id), []).append(int(tid_prefix))

    rows, unmatched = [], []
    with (DATA / "nikkes.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            code = r["파일명"].strip()          # 'c513'
            if not code.startswith("c"):
                unmatched.append(code)
                continue
            res_id = int(code[1:])
            prefixes = by_res.get(res_id)
            if not prefixes:
                unmatched.append(code)
                continue
            for prefix in prefixes:
                rows.append({
                    "tid_prefix": prefix,
                    "name": r["이름"].strip(),
                    "name_en": r["영문명"].strip(),
                    "short_name": (r["줄임말"] or "").strip() or None,
                    "burst": (r["버스트"] or "").strip() or None,
                    "element": (r["코드"] or "").strip() or None,
                    "img_code": code,
                })

    if unmatched:
        print(f"  ! resmap 에 없는 코드 {len(unmatched)}건: {unmatched[:5]}", file=sys.stderr)
    return rows


def write_nikkes(rows):
    lines = [
        "-- 자동 생성됨: scripts/generate_seed.py — 직접 수정하지 말 것",
        "-- 니케 마스터. tid_prefix = floor(squad.tid / 100)",
        "insert into nikkes (tid_prefix, name, name_en, short_name, burst, element, img_code) values",
    ]
    body = [
        "  ({tid_prefix}, {name}, {name_en}, {short_name}, {burst}, {element}, {img_code})".format(
            tid_prefix=r["tid_prefix"],
            name=q(r["name"]), name_en=q(r["name_en"]), short_name=q(r["short_name"]),
            burst=q(r["burst"]), element=q(r["element"]), img_code=q(r["img_code"]),
        )
        for r in sorted(rows, key=lambda x: x["tid_prefix"])
    ]
    lines.append(",\n".join(body))
    lines.append("on conflict (tid_prefix) do update set")
    lines.append("  name = excluded.name, name_en = excluded.name_en,")
    lines.append("  short_name = excluded.short_name, burst = excluded.burst,")
    lines.append("  element = excluded.element, img_code = excluded.img_code;")
    (OUT / "01_nikkes.sql").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(body)


def write_bosses():
    bosses = json.loads((DATA / "bosses.json").read_text(encoding="utf-8"))
    body = []
    for season in sorted(bosses, key=int):
        for b in bosses[season]:
            hp = b.get("hp") or []
            hp_lit = "array[" + ",".join(str(int(h)) for h in hp) + "]::bigint[]" if hp else "null"
            body.append(
                "  ({s}, {step}, {name}, {weak}, {eid}, {img}, {hp})".format(
                    s=int(season), step=int(b.get("step") or 0),
                    name=q(b.get("name")), weak=q(b.get("weak")),
                    eid=q(b.get("elementId")), img=q(b.get("img")), hp=hp_lit,
                )
            )
    sql = [
        "-- 자동 생성됨: scripts/generate_seed.py — 직접 수정하지 말 것",
        "-- 시즌별 보스 배치. 진행 중이 아닌 과거 차수의 HP 백업 소스이기도 하다.",
        "insert into season_bosses (season, step, name, weak, element_id, img, hp) values",
        ",\n".join(body),
        "on conflict (season, step) do update set",
        "  name = excluded.name, weak = excluded.weak, element_id = excluded.element_id,",
        "  img = excluded.img, hp = excluded.hp;",
    ]
    (OUT / "02_season_bosses.sql").write_text("\n".join(sql) + "\n", encoding="utf-8")
    return len(body)


def write_coef():
    coef = json.loads((DATA / "coef.json").read_text(encoding="utf-8"))
    body = [
        "  ({s}, {step}, {c})".format(s=int(season), step=int(step), c=float(c))
        for season in sorted(coef, key=int)
        for step, c in sorted(coef[season].items(), key=lambda kv: int(kv[0]))
    ]
    sql = [
        "-- 자동 생성됨: scripts/generate_seed.py — 직접 수정하지 말 것",
        "-- 난이도 계수. 매 시즌 수동 갱신이 필요하다(운영자 화면에서 편집).",
        "insert into season_coef (season, step, coef) values",
        ",\n".join(body),
        "on conflict (season, step) do update set coef = excluded.coef;",
    ]
    (OUT / "03_season_coef.sql").write_text("\n".join(sql) + "\n", encoding="utf-8")
    return len(body)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    n = write_nikkes(load_nikkes())
    b = write_bosses()
    c = write_coef()
    print(f"01_nikkes.sql        {n:4d} rows")
    print(f"02_season_bosses.sql {b:4d} rows")
    print(f"03_season_coef.sql   {c:4d} rows")
