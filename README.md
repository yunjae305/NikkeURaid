# NikkeURaid

승리의 여신: 니케 **유니온 레이드 전적 대시보드**.

사용자는 **서버와 유니온 ID만 입력**하면 된다. 설치도, 로그인도, 설정도 없다.
수집·인증·집계는 전부 서버가 짊어진다.

```
사용자 ──▶  서버 한국 / 유니온 28517  ──▶  딜 순위 · 미참여 · 조합 · 시즌 추이
```

---

## 구조

```
       [Supabase]                              [Vercel]
  pg_cron ──5분──▶ Edge Function                Next.js 대시보드
                       │                          (읽기 전용)
                       │ 세션 쿠키로 API 호출          ▲
                       ▼                             │
                  Postgres  ───── 집계 뷰 ────────────┘
                                                     │
                                                     ▼
                                              📱 폰 브라우저
```

| 결정 | 이유 |
|---|---|
| 스케줄러가 **Supabase**에 | Vercel Hobby 크론은 하루 1회 제한. `*/5 * * * *`는 배포 자체가 실패한다. pg_cron은 무료로 초 단위까지 된다 |
| 집계를 **SQL 뷰**로 | 참고한 GAS 구현은 이 계산에 1,600여 줄을 썼다. `GROUP BY` 로 끝날 일이었다 |
| Vercel은 **읽기 전용** | 수집 로직이 프론트에 없으니 배포가 데이터를 깨뜨릴 수 없다 |

---

## ⚠️ 아직 검증되지 않은 전제

이 서비스가 모든 기능을 지금 설계대로 제공하려면 **두 가지를 따로 확인해야** 한다.

> 1. 내가 속하지 않은 길드의 레이드 기록을 주는가?
> 2. 그 길드의 전체 명단도 주는가?

- **둘 다 준다** → 서비스 계정 하나로 딜·조합·추이와 정확한 미참여 체크까지 제공한다
- **기록만 준다** → 딜·조합·추이는 제공하지만, 공격하지 않은 길드원을 알 수 없어 미참여 체크가 제한된다
- **기록도 안 준다** → 길드마다 소속원 1명이 최초 1회 인증해야 한다 (나머지는 그대로 ID만 입력)

검증 절차는 [`docs/phase0-verification.md`](docs/phase0-verification.md) 에 있다.
**이 결과가 나오기 전에는 수집 Edge Function을 작성하지 않는다** — 구조가 갈리기 때문이다.

---

## 현재 상태

| 영역 | 상태 |
|---|---|
| DB 스키마 (멀티테넌트) | ✅ 작성 + 로컬 Postgres 16 검증 완료 |
| 집계 뷰 6종 | ✅ 실데이터 형태로 쿼리 검증 완료 |
| 시드 (니케 196 / 보스 45 / 계수 5) | ✅ 생성 + 적재 검증 완료 |
| 이미지 자산 (니케 397 · 보스 65) | ✅ 커밋됨, jsDelivr 서빙 가능 |
| 수집 Edge Function | ⏳ Phase 0 검증 대기 |
| Next.js 대시보드 | ⏳ 목업만 ([`docs/mockup.html`](docs/mockup.html)) |

---

## 디렉터리

```
supabase/
  migrations/
    20260819000100_init.sql     테이블 · 인덱스 · RLS
    20260819000200_views.sql    집계 뷰 6종
  seed/                         ← 자동 생성. 직접 수정 금지
data/                           원본 (CSV · JSON). 시드의 진짜 출처
scripts/generate_seed.py        data/ → supabase/seed/
assets/nikke/                   니케 초상화 397장
assets/boss/                    보스 이미지 65장
docs/
  IMPLEMENTATION.md             ★ 구현 명세. 이어받는 사람은 여기부터
  PLAN.md                       전체 구축 계획
  phase0-verification.md        인증 검증 절차
  mockup.html                   모바일 UI 목업 (폰에서 열어볼 것)
```

---

## 셋업

### 1. DB

```bash
supabase link --project-ref <ref>
supabase db push
psql "$DATABASE_URL" -f supabase/seed/01_nikkes.sql
psql "$DATABASE_URL" -f supabase/seed/02_season_bosses.sql
psql "$DATABASE_URL" -f supabase/seed/03_season_coef.sql
```

### 2. 시드 재생성 (게임 업데이트 후)

`data/` 의 원본을 갱신한 뒤:

```bash
python3 scripts/generate_seed.py
```

`supabase/seed/*.sql` 는 전부 UPSERT라 몇 번을 돌려도 안전하다.

### 3. 이미지

jsDelivr가 이 저장소를 그대로 서빙한다:

```
https://cdn.jsdelivr.net/gh/yunjae305/NikkeURaid@main/assets/nikke/si_c513_00_s.png
https://cdn.jsdelivr.net/gh/yunjae305/NikkeURaid@main/assets/boss/Enemy_Dual_Ring.webp
```

파일명은 `nikkes.img_code` / `season_bosses.img` 로 조립한다.

---

## 데이터 모델에서 알아둘 것

**사람의 신원은 `openid` 다.** `nickname` 은 공격 시점의 스냅샷일 뿐이다.
닉을 바꾸거나 길드를 나갔다 들어와도 기록이 이어지려면 `openid` 로 묶어야 한다.

**`tid` 는 캐릭터와 등급을 함께 담는다.**

```
tid 25301  →  25301 / 100 = 253  →  nikkes.tid_prefix
           →  25301 % 100 =  1   →  0돌 (2=1돌 … 5~11=1~7코강)
```

**중복 방지 키는 `(길드, 시즌, 일자, openid, 보스, 딜량)`.**
같은 사람이 같은 날 같은 보스에 딜이 1까지 똑같이 나올 확률은 무시할 수 있다.
게임 API가 같은 기록을 여러 번 주더라도 이 제약이 걸러낸다.

**진행 중 시즌은 API 응답 순서가 최신→과거다.** 단순 append로는 공격 순서가 깨진다.
수집기는 진행 중 시즌을 시즌 단위 스냅샷으로 교체해야 한다 — 단, **새로 받은 건수가
기존보다 적으면 교체를 보류**해야 부분 응답이 멀쩡한 데이터를 지우지 않는다.

---

## 참고

구조와 API 스펙은 [ddssh1056/nikkeRaid](https://github.com/ddssh1056/nikkeRaid) 를 참고했다.
그쪽은 Tampermonkey + Apps Script 기반의 단일 길드용 도구이고,
이 저장소는 같은 데이터를 **누구나 쓰는 서비스**로 다시 세운 것이다.

비상업 팬 프로젝트다. 조회는 최소 간격을 지키고, 수집한 데이터는 게임 내에서
이미 공개된 정보의 범위를 넘지 않는다.
