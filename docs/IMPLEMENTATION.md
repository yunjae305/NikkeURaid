# NikkeURaid 구현 명세

> **이 문서의 독자는 이 프로젝트를 이어받아 구현할 에이전트다.**
> 배경 지식이 없다고 가정하고 쓴다. 결정된 것은 결정된 이유와 함께 적고,
> 아직 모르는 것은 **모른다고 명시**한다. 모르는 것을 아는 것처럼 다루지 말 것.

---

## 0. 읽는 법

| 표기 | 뜻 |
|---|---|
| ✅ **검증됨** | 실제로 실행해서 확인함. 신뢰해도 됨 |
| 📋 **추정** | 참고 구현(nikkeRaid)에서 읽어낸 것. 실물 확인 안 됨. **코드로 옮기기 전에 검증할 것** |
| ⛔ **금지** | 하지 말 것. 이유가 함께 적혀 있음 |
| 🔀 **분기** | Phase 0 결과에 따라 갈림 |

**작업 순서 규칙**: Phase 는 번호순으로 진행한다. Phase 0 을 건너뛰고 Phase 2 를
시작하면 버릴 코드를 쓰게 된다. 이건 취향이 아니라 구조적 제약이다.

---

## 1. 프로젝트 정의

### 무엇을 만드는가

승리의 여신: 니케의 **유니온 레이드(유레) 전적 대시보드**.
길드원이 폰으로 접속해 서버와 유니온 ID를 입력하면 자기 길드의 레이드 기록을 본다.

### 사용자가 하는 일의 전부

```
1. 웹사이트 접속
2. 서버 선택 (한국/일본/북미/글로벌/동남아)
3. 유니온 ID 입력 (예: 28517)
4. 끝
```

설치 없음. 로그인 없음. 설정 없음. **이 제약이 이 프로젝트의 전부다.**
어떤 설계 결정이든 "사용자가 뭔가를 더 해야 하는가"를 먼저 물을 것.

### 핵심 기능 4가지

| # | 기능 | 화면 | 데이터 출처 |
|---|---|---|---|
| 1 | 딜 순위 / 기여도 | 개요 | `v_member_daily` |
| 2 | 티켓 소진 / 미참여 체크 | 개요 | `v_participation` |
| 3 | 보스별 조합 분석 | 조합 | `v_combo_stats`, `v_nikke_usage` |
| 4 | 시즌 추이 / 기록 비교 | 추이 | `v_season_totals`, `v_member_growth` |

기능 2가 총무가 가장 자주 보는 화면이다. 우선순위를 매길 때 이걸 기억할 것.

### 비목표 (하지 말 것)

- ⛔ 사용자 계정 시스템 — 로그인이 생기는 순간 이 제품의 전제가 무너진다
- ⛔ 게임 내 행동을 대신 수행하는 기능 — 조회 전용이다
- ⛔ 상업화 — 비상업 팬 프로젝트다
- ⛔ 원본 nikkeRaid 의 "모의전" 탭 — 수동 입력 기능이라 이 제품 방향과 어긋난다

---

## 2. 현재 상태 (2026-08-19)

### 완료 ✅

| 항목 | 위치 | 검증 방법 |
|---|---|---|
| 멀티테넌트 스키마 | `supabase/migrations/20260819000100_init.sql` | 로컬 Postgres 16 적용 성공 |
| 집계 뷰 6종 | `supabase/migrations/20260819000200_views.sql` | 대표 데이터로 6개 뷰 전부 쿼리 확인 |
| 시드 196/45/5행 | `supabase/seed/*.sql` | 적재 후 count 확인 |
| 시드 생성기 | `scripts/generate_seed.py` | 재실행 멱등성 확인 |
| 니케 이미지 397장 | `assets/nikke/` | 196종 전부 base 파일 존재 확인 |
| 보스 이미지 65장 | `assets/boss/` | — |
| 모바일 UI 목업 | `docs/mockup.html` | 390px 뷰포트 렌더 확인 |

### 미완료 ⏳

| 항목 | 막고 있는 것 |
|---|---|
| Phase 0 인증 검증 | **사람이 브라우저에서 해야 함.** 자동화 불가 (로그인 필요) |
| 수집 Edge Function | Phase 0 결과 |
| pg_cron 등록 | 수집 함수 |
| Next.js 대시보드 | 없음 — 지금 시작해도 됨 |
| Supabase 프로젝트 생성 | 사용자 승인 |
| Vercel 배포 | Next.js |

### 검증된 사실 몇 가지 ✅

- `data/resmap.json` 과 `data/nikkes.csv` 는 **196/196 완전 일치**한다. 누락 없음
- 니케 196종 전부 `assets/nikke/si_{img_code}_00_s.png` 가 존재한다
- `data/bosses.json` 은 **35~43차**를 담고 있다
- 43차 보스 배치 = `선바스 / 플레이트 / 토커티브 / 리빌드 핑거즈 / 마테리얼H`
  → 사용자 스크린샷의 "리빌드 핑거즈 [D.M.T.R.]" 와 일치. **현재 진행 차수는 43차로 추정**
- `data/coef.json` 에는 **40차 하나뿐**이다. 41~43차 계수는 없다

---

## 3. 아키텍처 (결정 완료 — 재검토 금지)

```
       [Supabase]                                    [Vercel]
                                                  Next.js 대시보드
  pg_cron ──5분──▶ Edge Function: collect            (읽기 전용)
                        │                                ▲
                        │ 서비스 계정 세션 쿠키로 호출      │
                        ▼                                │
              api.blablalink.com                         │
                        │                                │
                        ▼                                │
                   Postgres ────── 집계 뷰 ───────────────┘
                        │
                        └─ (주 1회) Google Sheets 백업 스냅샷
```

### 왜 이렇게 정했는가

이미 검토를 마친 사항이다. **다시 논의하지 말고 그대로 따를 것.**

| 결정 | 근거 |
|---|---|
| 스케줄러가 Supabase (Vercel 아님) | **Vercel Hobby 크론은 하루 1회 제한.** `*/5 * * * *` 같은 표현은 배포 자체가 실패한다. pg_cron 은 무료 플랜에서 초 단위까지 지원 |
| 집계를 SQL 뷰로 | 참고 구현은 이 계산을 Apps Script 1,600여 줄로 했다. `GROUP BY` 로 끝날 일이었다 |
| Vercel 은 읽기 전용 | 수집 로직이 프론트에 없으면 프론트 배포가 데이터를 깨뜨릴 수 없다 |
| DB 는 Supabase 단일 소스 | 두 저장소를 동기화하는 건 언제나 버그의 원천 |
| Google Sheets 는 백업 전용 | 무료 Supabase 는 백업이 부실하다. 다만 **관리 UI 로는 쓰지 않는다** — 시트를 손으로 고치게 두면 "누가 행을 지웠다" 사고가 반드시 난다 |
| 리전 `ap-northeast-2` | 주 사용자가 한국 서버 |

### 비용

전부 무료 플랜. Supabase 프로젝트 생성 비용 **$0/월 확인됨** ✅

---

## 4. 외부 API 명세

> 📋 **이 절 전체가 추정이다.** 참고 구현(`nikkeRaid/nikke-raid-sync.user.js` v1.9)에서
> 읽어낸 것이고, 실제 응답으로 확인하지 않았다. Phase 0 에서 검증한 뒤 이 문서를 갱신할 것.

### 공통 요청 형식

모든 호출은 `POST`, 본문은 JSON.

```http
POST https://api.blablalink.com/api/game/proxy/Game/{endpoint}
content-type: application/json
x-channel-type: 2
x-language: ko
x-common-params: {"game_id":"16","area_id":"global","source":"pc_web","intl_game_id":"29080","language":"ko","env":"prod","data_statistics_scene":"outer","data_statistics_page_id":"https://www.blablalink.com/shiftyspad","data_statistics_client_type":"pc_web","data_statistics_lang":"ko"}
cookie: <세션 쿠키>
```

`x-common-params` 안의 `area_id: "global"` 은 **서버 지역이 아니다.** 지역은 본문의
`area_id` / `nikke_area_id` 로 넘긴다. 헷갈리지 말 것.

### 지역 코드

| area_id | 서버 |
|---|---|
| 81 | 일본 |
| 82 | 북미 |
| 83 | 한국 |
| 84 | 글로벌 |
| 85 | 동남아 |

### 엔드포인트

#### ① `GetUnionRaidDataOfGuildSeason` — 정산 완료 시즌

```json
{ "area_id": 83, "guild_id": "28517", "season_id": "1000042" }
```

- `season_id = 1000000 + 차수`
- 📋 **진행 중 시즌을 요청하면 빈 `participate_data` 를 반환한다.** 이게 ② 가 필요한 이유
- 과거 차수 백필에 사용

#### ② `GetUnionRaidData` — 진행 중 시즌

```json
{ "guild_id": "28517", "nikke_area_id": 83, "intl_open_id": "9583..." }
```

- **시즌을 지정하지 않는다.** 항상 현재 진행 중인 시즌을 반환
- 키 이름이 ① 과 다르다: `area_id` 가 아니라 `nikke_area_id`
- 📋 `total_damage` 가 **문자열**로 온다 (① 은 숫자). 정규화에서 `Number()` 통일 필요
- 📋 응답 순서가 **최신 → 과거**다. 이게 §7.3 의 근거

#### ③ `GetUnionRaidLevelInfo` — 보스 단계별 HP

본문은 ② 와 동일.

```
data.level_info[] = { difficulty, level, boss_info[] }
data.level_info[].boss_info[] = { name_localvalues, max_hp, current_hp, element_id, boss_id, icon_id }
```

- 📋 `max_hp` / `current_hp` 가 **문자열**
- ⚠️ **`boss_info` 배열의 순서는 `step` 순서와 다르다.** 인덱스로 매칭하지 말고
  **보스 이름(정제 후)으로 매칭**할 것
- 📋 진행 중 시즌에만 응답한다. 정산 후에도 주는지는 미확인

#### ④ `GetGuildMembers` — 길드원 명단

```json
{ "guild_id": "28517", "nikke_area_id": 83 }
```

- 응답 위치가 유동적: `data.items` 또는 `items`
- **미참여 체크의 유일한 근거.** 이게 없으면 공격을 안 한 사람은 존재 자체가 안 보인다
- 🔀 이 엔드포인트가 남의 길드에도 응답하는지는 **별도 검증 필요** (§5 검증 1-B)

#### ⑤ `GetUserInfoNew` — 자기 openid 획득

```http
POST https://api.blablalink.com/api/ugc/proxy/standalonesite/User/GetUserInfoNew
body: {}
```

- `data.info.intl_openid` → `"29080-9583..."` 형식
- **앞의 게임 prefix 를 떼야 한다**: `String(raw).replace(/^\d+-/, '')`
- ② 와 ③ 호출에 필요

### 보조 리소스 (해시 경로 — 게임 패치 시 URL 이 바뀜)

| 용도 | URL |
|---|---|
| 시즌 표 | `https://sg-tools-cdn.blablalink.com/rm-58/a7f993363fe3e2df8a4a7e579decc872.json` |
| 캐릭터 목록 | `https://sg-tools-cdn.blablalink.com/wi-97/ni-77/ffc69c4074f27bc772acbe869127e616.json` |

⛔ **캐릭터 목록 CDN 에 의존하지 말 것.** 우리는 `nikkes` 테이블을 시드해뒀다.
다만 **신규 니케가 출시되면 시드에 없어서 이름을 못 찾는다.** 그때는
`tid_prefix` 를 그대로 표시하고(`Unknown(25301)` 같은 식) 운영자에게 알린 뒤
`data/nikkes.csv` 를 갱신 → `generate_seed.py` 재실행하는 경로로 처리한다.
런타임에 CDN 을 긁어 자동 보정하는 건 하지 말 것 — 해시 URL 이 언제든 죽는다.

---

## 5. Phase 0 — 인증 검증 ★최우선 블로커

> **사람이 브라우저에서 직접 해야 한다.** 에이전트가 대신할 수 없다(로그인 필요).
> 결과가 나오기 전에는 Phase 2 를 시작하지 말 것.

### 검증 1-A — 남의 길드 *레이드 기록* 조회

blablalink 로그인 상태, 유레 페이지, `F12` → Console:

```js
fetch('https://api.blablalink.com/api/game/proxy/Game/GetUnionRaidDataOfGuildSeason', {
  method: 'POST', credentials: 'include',
  headers: {
    'content-type': 'application/json',
    'x-channel-type': '2', 'x-language': 'ko',
    'x-common-params': '{"game_id":"16","area_id":"global","source":"pc_web","intl_game_id":"29080","language":"ko","env":"prod"}'
  },
  body: JSON.stringify({ area_id: 83, guild_id: '남의길드ID', season_id: '1000042' })
}).then(r => r.json()).then(console.log);
```

### 검증 1-B — 남의 길드 *명단* 조회

```js
fetch('https://api.blablalink.com/api/game/proxy/Game/GetGuildMembers', {
  method: 'POST', credentials: 'include',
  headers: {
    'content-type': 'application/json',
    'x-channel-type': '2', 'x-language': 'ko',
    'x-common-params': '{"game_id":"16","area_id":"global","source":"pc_web","intl_game_id":"29080","language":"ko","env":"prod"}'
  },
  body: JSON.stringify({ guild_id: '남의길드ID', nikke_area_id: 83 })
}).then(r => r.json()).then(console.log);
```

⚠️ **대조군을 반드시 함께 돌릴 것.** 우리 길드 ID로 같은 요청을 보내 정상 응답이
오는지 확인한다. 그러지 않으면 "권한이 없어서 빈 응답"인지 "그 길드가 그 차수에
참여를 안 해서 빈 응답"인지 구분할 수 없다.

### 검증 2 — 쿠키 성격

`F12` → Application → Cookies → `https://www.blablalink.com`

| 확인 항목 | 왜 |
|---|---|
| 인증 쿠키 이름 | 서버가 저장할 대상 |
| `HttpOnly` 여부 | 켜져 있으면 북마클릿이 `document.cookie` 로 못 읽는다 |
| `Expires` / `Max-Age` | 한 달이면 갱신 걱정 없음. 하루면 설계가 달라짐 |

### 검증 3 — 응답 샘플 확보

①②③④⑤ 각각의 응답 JSON 을 `docs/samples/` 에 저장.
파싱 코드의 회귀 기준이 된다.

⛔ **커밋 전에 쿠키·토큰·실제 openid 를 반드시 지울 것.** 공개 저장소다.

**특히 `squad` 배열의 실물이 필요하다.** 참여 상황 표에서 돋보기를 누르면 나오는
스쿼드 상세다. 조합 분석 전체가 이 구조 위에 선다.

### 🔀 결과에 따른 분기

| 1-A | 1-B | 설계 |
|---|---|---|
| ✅ | ✅ | **경로 A.** 서비스 계정 1개로 전부 대행. 원래 설계 그대로 |
| ✅ | ❌ | **경로 A′.** 기록은 되는데 명단이 안 됨 → 미참여 체크는 "공격 기록에 등장한 사람" 기준으로 축소. 정확도가 떨어짐을 UI에 명시 |
| ❌ | — | **경로 B.** 길드당 소속원 1명이 최초 1회 북마클릿 클릭으로 연결. 나머지 인원은 그대로 ID만 입력 |

**경로 B 의 북마클릿 동작** (쿠키가 HttpOnly 여도 작동):
페이지 컨텍스트에서 API 를 직접 호출 → 응답 JSON 을 Supabase 수집 엔드포인트로
`fetch(url, {method:'POST', mode:'no-cors', body})` 전송. 쿠키 값을 알 필요가 없다.

---

## 6. 데이터 모델 계약

### 불변 규칙 — 어기면 데이터가 조용히 망가진다

1. **사람의 신원은 `openid` 다.** `nickname` 은 공격 시점의 스냅샷일 뿐이다.
   ⛔ 닉네임으로 사람을 조인하지 말 것. 닉을 바꾸면 기록이 두 사람으로 갈라진다.

2. **모든 길드 데이터는 `(area_id, guild_id)` 로 격리된다.**
   ⛔ 이 두 컬럼 없이 `attacks` 를 쿼리하지 말 것. 다른 길드 데이터가 섞인다.

3. **중복 방지 키**: `(area_id, guild_id, season, day, openid, boss, total_damage)`
   같은 사람이 같은 날 같은 보스에 딜이 1까지 똑같이 나올 확률은 무시 가능하다.
   API 가 같은 기록을 여러 번 줘도 이 제약이 걸러낸다. `on conflict do nothing` 을 쓸 것.

4. **쓰기는 `service_role` 만.** `auth_session` / `sync_log` 는 RLS 만 켜고 정책을
   만들지 않았다 = anon/authenticated 전면 차단. ⛔ 여기에 정책을 추가하지 말 것.

### 테이블 요약

| 테이블 | 키 | 역할 |
|---|---|---|
| `areas` | `area_id` | 서버 지역 (시드됨) |
| `guilds` | `(area_id, guild_id)` | 테넌트. `sync_state`, `last_viewed` 가 크론 큐를 움직인다 |
| `nikkes` | `tid_prefix` | 니케 마스터 (전역, 196행 시드됨) |
| `members` | `(area_id, guild_id, openid)` | 길드원. 미참여 판정의 기준 |
| `attacks` | `id` + unique 제약 | 공격 1건 = 1행. 이 프로젝트의 심장 |
| `boss_levels` | `(area_id, guild_id, season, difficulty, boss, level)` | 단계별 HP |
| `season_bosses` | `(season, step)` | 시즌 보스 배치 (전역, 45행 시드됨) |
| `season_coef` | `(season, step)` | 난이도 계수 (전역, 40차만 있음) |
| `auth_session` | `id = 1` | 세션 쿠키. **단일 행 강제** |
| `sync_log` | `id` | 동기화 이력 |

### 집계 뷰 6종

| 뷰 | 화면 | 핵심 |
|---|---|---|
| `v_member_daily` | 딜 순위 | 윈도우 함수로 기여도 % 계산 |
| `v_participation` | **미참여 체크** | `members` 기준 LEFT JOIN → 기록 0건도 0/3 으로 잡힘 ✅ |
| `v_season_totals` | 시즌 추이 | 차수별 총딜·참여자 수 |
| `v_combo_stats` | 조합 분석 | 이름 정렬 배열을 조합 키로 → 슬롯 순서 달라도 하나로 묶임 ✅ |
| `v_nikke_usage` | 조합 필터 | 니케별 출전 횟수·평균 딜 |
| `v_member_growth` | 개인 성장 | `lag()` 로 전 차수 대비 |
| `v_sync_queue` | 크론 | 조회 시점 기준 5분/30분/6시간 차등 |

---

## 7. 정규화 규칙 (수집 함수의 핵심)

> API 응답 → `attacks` 행으로 바꾸는 변환. **여기가 틀리면 모든 화면이 틀린다.**

### 7.1 필드 매핑

| DB 컬럼 | 원본 | 변환 |
|---|---|---|
| `season` | `season_id` | `season_id - 1000000` |
| `day` | `rec.day` | **`rec.day + 1`** — 원본은 0-based다 |
| `step` | `rec.step` | 그대로 |
| `difficulty` | `rec.difficulty` | 1=일반, 2=하드 |
| `level` | `rec.level` | 보스 단계 |
| `boss` | `rec.name_localvalues.ko` | **`[...]` 제거 후 trim** (§7.2) |
| `element` | `rec.element_id[0]` | 배열 첫 원소 |
| `openid` | `rec.openid` | 그대로 |
| `nickname` | `rec.nickname` | 그대로 |
| `total_damage` | `rec.total_damage` | **`Number()` 로 통일** — 진행 중 API 는 문자열 |
| `is_final_hit` | `rec.is_final_hit` | boolean |
| `sync_lv` | `rec.squad[].lv` | **squad 레벨의 최댓값** |
| `squad` | `rec.squad` | §7.4 로 변환 |

### 7.2 보스 이름 정제 — 중요

```js
boss = (name || 'Unknown').replace(/\s*\[.*?\]/g, '').trim()
```

게임은 `"리빌드 핑거즈 [D.M.T.R.]"` 로 주는데 `season_bosses.name` 은
`"리빌드 핑거즈"` 다. **정제하지 않으면 시즌 보스 표와 조인이 전부 실패한다.**

### 7.3 tid 해석

```
tid = 25301
  tid_prefix = floor(25301 / 100) = 253   → nikkes 조인 키
  grade_code = 25301 % 100        = 1     → 등급
```

| `tid % 100` | 등급 |
|---|---|
| 1 | 0돌 |
| 2 | 1돌 |
| 3 | 2돌 |
| 4 | 3돌 |
| 5 ~ 11 | `(v-4)` 코강 → 1~7코강 |
| 그 외 | 미상. `?(v)` 로 표시하고 로그 남길 것 |

### 7.4 squad JSON 형식

`attacks.squad` 에 저장할 정규 형식:

```json
[
  {"slot":1,"tid":25301,"name":"크라운","lv":267,"break":"0돌","combat":81817},
  {"slot":2,"tid":19102,"name":"홍련","lv":267,"break":"1돌","combat":74942}
]
```

- `slot` 은 1~5. 범위 밖이면 버릴 것
- `name` 은 `nikkes` 조회 결과. 못 찾으면 `"Unknown(25301)"`
- `combat` 은 전투력(스크린샷의 검 아이콘 옆 숫자). 📋 필드명 미확인 — Phase 0 샘플에서 확인
- ⚠️ `v_combo_stats` / `v_nikke_usage` 가 `e ->> 'name'` 을 읽는다. **`name` 키는 필수다**

### 7.5 진행 중 시즌 적재 — 순서 보존 문제

📋 진행 중 시즌 API 는 응답을 **최신 → 과거** 순으로 준다.
단순 append 하면 첫 동기화의 큰 묶음(역순)과 이후 소량(시간순)이 섞여
공격 순서를 복원할 수 없게 된다.

**해법**: 진행 중 시즌은 append 가 아니라 **시즌 단위 스냅샷 교체**.

```
1. 새로 받은 진행 중 시즌 기록 수 = fresh
2. DB 에 있는 같은 시즌 기록 수   = existing
3. if (fresh > 0 && fresh >= existing)  → 그 시즌 행을 전부 지우고 fresh 로 재기록
   else                                 → 교체 보류, 평소대로 upsert
```

⛔ **가드 없이 교체하지 말 것.** 부분 응답이나 일시적 오류가 멀쩡한 데이터를
통째로 날린다. 레이드 진행 중에 기록 수가 줄어드는 일은 없으므로,
줄었다면 그건 비정상 응답이다.

정산이 끝난 시즌은 그냥 `on conflict do nothing` upsert 로 충분하다.

---

## 8. Phase 별 작업

### Phase 1 — Supabase 구축

**선행**: 사용자의 프로젝트 생성 승인
**차단 요소**: 없음 (Phase 0 과 무관하게 진행 가능)

| # | 작업 | 완료 기준 |
|---|---|---|
| 1.1 | 프로젝트 생성 — 이름 `nikke-raid`, 리전 `ap-northeast-2`, 비용 $0 | `get_project` 가 `ACTIVE_HEALTHY` |
| 1.2 | `20260819000100_init.sql` 적용 | 테이블 10개 생성 |
| 1.3 | `20260819000200_views.sql` 적용 | 뷰 7개 생성 |
| 1.4 | 시드 3개 적용 | `nikkes` 196 / `season_bosses` 45 / `season_coef` 5 |
| 1.5 | RLS 확인 | anon 으로 `auth_session` SELECT 시 0행 또는 거부 |
| 1.6 | `pg_cron`, `pg_net` 확장 활성화 | `list_extensions` 에서 확인 |

⚠️ 1.5 를 반드시 확인할 것. RLS 를 켜고 정책을 안 만들면 차단이 맞지만,
실수로 정책이 생기면 세션 쿠키가 공개된다.

### Phase 2 — 수집 Edge Function 🔀

**선행**: Phase 0 완료 (경로 A / A′ / B 확정)
⛔ **Phase 0 없이 시작하지 말 것.**

| # | 작업 | 완료 기준 |
|---|---|---|
| 2.1 | `supabase/functions/collect/index.ts` 골격 | 길드 1개를 인자로 받아 실행 |
| 2.2 | 세션 쿠키 로딩 (`auth_session`) | 없거나 만료면 `auth_required` 로 표시하고 종료 |
| 2.3 | ⑤ 로 `intl_open_id` 획득 + 캐시 | prefix 제거 확인 |
| 2.4 | ① 정산 시즌 백필 (시즌 순회) | 빈 응답 시 중단. 상한 지킬 것 |
| 2.5 | ② 진행 중 시즌 + §7.5 교체 가드 | 가드 동작을 테스트로 확인 |
| 2.6 | ③ 보스 HP — **이름으로 매칭** | 인덱스 매칭 금지 |
| 2.7 | ④ 명단 → `members` upsert | 사라진 사람은 `is_active = false` (삭제 금지) |
| 2.8 | §7 정규화 전부 적용 | 샘플 JSON 으로 단위 테스트 |
| 2.9 | `sync_log` 기록 + `guilds.last_synced` 갱신 | 성공/실패 모두 남길 것 |
| 2.10 | 401/권한 오류 → `sync_state='auth_required'` | 전체 크론이 죽지 않게 격리 |
| 2.11 | 연속 실패 카운트 → `fail_count` 증가, 임계 초과 시 `dead` | 무한 재시도 방지 |

**시즌 순회 규칙**:
- 시작은 `35`(bosses.json 최소값) 또는 길드별 마지막 성공 지점
- 빈 응답이 나오면 중단. 단 **최초 탐색에서는 여러 번 연속 빈 응답을 허용** —
  과거 차수에 참여 안 한 길드가 있다
- 상한을 반드시 둘 것 (무한 루프 방지)

### Phase 3 — 크론 등록

| # | 작업 | 완료 기준 |
|---|---|---|
| 3.1 | `v_sync_queue` 상위 N개를 처리하는 디스패처 함수 | 한 사이클 처리 길드 수 상한 (권장 20) |
| 3.2 | `pg_cron` 5분 스케줄 등록 (`pg_net` 으로 Edge Function 호출) | `cron.job` 에 등록 확인 |
| 3.3 | 온디맨드 수집 API — 신규 길드 조회 시 즉시 실행 | 최초 조회 30초 내 데이터 |
| 3.4 | `guilds.last_viewed` 갱신 경로 | 대시보드 접속 시 갱신 |

⛔ **전 길드를 5분마다 돌리지 말 것.** API 부하로 서비스 계정이 차단된다.

### Phase 4 — Next.js 대시보드

**선행**: Phase 1 (스키마). Phase 2 없이도 시작 가능 (목업 데이터로)

| # | 작업 | 완료 기준 |
|---|---|---|
| 4.1 | App Router 프로젝트 + Supabase 클라이언트 | 빌드 통과 |
| 4.2 | 랜딩 `/` — 서버 선택 + 유니온 ID 입력 + 최근 본 길드(localStorage) | 360px 에서 깨지지 않음 |
| 4.3 | `/u/[area]/[guild]` — 개요 탭 | 딜 순위 · 기여도 · **미참여 카드** |
| 4.4 | 조합 탭 | 조합 랭킹 · 니케 필터 · 산점도 |
| 4.5 | 추이 탭 | 차수별 총딜 · 개인 성장 |
| 4.6 | 운영자 화면 | 세션 갱신 · 큐 상태 · 계수 편집. 비밀번호 잠금 |
| 4.7 | 최초 조회 시 "수집 중" 상태 | 스켈레톤 + 진행 표시 |
| 4.8 | OG 이미지 | 단톡방 링크 미리보기 |
| 4.9 | PWA 매니페스트 | "홈 화면에 추가" 동작 |

**UI 기준**: `docs/mockup.html` 이 레퍼런스다. 여기서 정한 것들 —
- 가로 표 대신 세로 리스트 + 행 배경 막대 (폰에서 4열 표는 뭉개진다)
- 미참여를 **최상단 경고 카드**로 (총무가 가장 자주 보는 정보)
- 차트에 툴팁 + "표로 보기" 접이식 (색만으로 판단 못 하는 경우 대비)
- 다크모드는 자동 반전이 아니라 어두운 배경용으로 색을 따로 잡음

**URL 이 곧 상태**: `/u/83/28517?season=43&day=2` — 공유하면 같은 화면이 떠야 한다.

### Phase 5 — 배포 및 운영

| # | 작업 | 완료 기준 |
|---|---|---|
| 5.1 | Vercel 배포 + 환경변수 | 프로덕션 URL 동작 |
| 5.2 | 이미지 jsDelivr 경로 검증 | 462장 전부 200 응답 |
| 5.3 | 주 1회 시트 백업 | pg_cron → Sheets API |
| 5.4 | 쿠키 만료 배너 | `auth_required` 감지 시 상단 표시 |
| 5.5 | 용량 정리 정책 | §9 참조 |

---

## 9. 알려진 제약과 함정

| 제약 | 수치/조건 | 대응 |
|---|---|---|
| **Vercel Hobby 크론** | 하루 1회, ±59분 | 스케줄러를 Supabase 에 둠 (이미 반영) |
| **Supabase 무료 DB** | 500MB | 길드당 40차 기준 약 20MB → **약 25길드가 한계**. 넘으면 오래된 시즌 요약만 보관 |
| **Supabase 무료 일시정지** | 7일 무활동 | 5분 크론이 계속 돌아 해당 없음 |
| **서비스 계정 차단 위험** | — | ⛔ 본계정 금지, 전용 부계정 사용. 조회 간격 확보. 우선순위 큐 필수 |
| **CDN 해시 URL** | 게임 패치 시 변경 | 런타임 의존 금지. 시드 테이블 사용 |
| **`season_coef` 결손** | 40차만 있음 | 41차 이후는 계수 없이 원본 딜로 표시하거나 운영자가 입력 |
| **신규 니케** | 시드에 없음 | `Unknown(tid)` 표시 + 운영자 알림 → CSV 갱신 경로 |
| **서비스 약관** | — | 비상업 명시, 과도한 폴링 금지, 게임 내 공개 정보 범위 유지 |

---

## 10. 코드 규약

- **SQL**: 소문자 키워드, 2칸 들여쓰기. 뷰는 화면 하나당 하나
- **TypeScript**: Edge Function 은 Deno. `any` 금지
- **주석은 "왜"만 쓴다.** "무엇"은 코드가 말한다. 특히 §7.5 의 교체 가드처럼
  나중 사람이 "이게 왜 있지?" 할 부분에 반드시 남길 것
- **커밋 메시지**: 무엇을 왜 바꿨는지. 검증했다면 어떻게 검증했는지
- **파일 경로**: `supabase/seed/*.sql` 은 자동 생성물이다. ⛔ 직접 수정 금지 —
  `data/` 를 고치고 `scripts/generate_seed.py` 를 재실행할 것

---

## 11. 용어집

| 용어 | 뜻 |
|---|---|
| 유레 | 유니온 레이드. 길드 단위 보스 레이드 콘텐츠 |
| 차수 / 시즌 | 유레 회차. `season_id = 1000000 + 차수` |
| Day | 1 = 일반, 2 = 하드. **API 는 0-based** |
| step | 보스 위치 (1~5) |
| level | 보스 단계 (1~) |
| 티켓 | 하루 공격 횟수. 1일 3회 |
| 막타 | 보스를 쓰러뜨린 마지막 공격 (`is_final_hit`) |
| 싱크로 | 니케 레벨을 일괄로 올리는 시스템. `sync_lv` |
| 돌파 / 코강 | 캐릭터 강화 등급. `tid % 100` 으로 판별 |
| openid | 사용자 고유 ID. **닉네임과 달리 변하지 않음** |
| tid | 캐릭터 + 등급 합성 ID |

---

## 12. 다음에 할 일 (우선순위 순)

```
1. [사람]   Phase 0 검증 1-A, 1-B, 2, 3          ← 최우선 블로커
2. [사람]   Supabase 프로젝트 생성 승인
3. [사람]   GitHub 레포를 세션 소스에 추가        ← 현재 push 차단 상태
4. [에이전트] Phase 1 전체 (0 결과와 무관)
5. [에이전트] Phase 4.1~4.3 (목업 데이터로 선행 가능)
6. [에이전트] Phase 0 결과 반영 → §4 갱신, 경로 확정
7. [에이전트] Phase 2 → 3 → 4 나머지 → 5
```

**4번과 5번은 지금 당장 시작할 수 있다.** 1번을 기다리는 동안 놀지 말 것.
