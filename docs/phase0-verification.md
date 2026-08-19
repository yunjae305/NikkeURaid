# Phase 0 — 인증 검증

수집 Edge Function을 작성하기 전에 반드시 통과해야 하는 관문.
**여기서 나온 답이 수집 엔진의 구조를 결정한다.** 모르는 채로 짜면 나중에 갈아엎게 된다.

준비물: blablalink 로그인된 데스크톱 브라우저. 10분.

## 한 번에 수집하기 (권장)

개별 명령을 다섯 번 옮겨 적는 대신 [`phase0-console.js`](phase0-console.js)의 전체 내용을
복사해 사용할 수 있다.

1. 로그인된 BlablaLink 페이지에서 `F12` → **Sources** → **Snippets** → 새 Snippet을 만든다.
2. 파일 전체를 붙여넣고 `Ctrl+Enter`로 실행한다.
3. 서버, 내 유니온 ID, 남의 유니온 ID, 정산이 끝난 차수를 차례로 입력한다.
4. 내려받은 `nikkeuraid-phase0-*.json`을 열어 실제 `openid`, 닉네임, 쿠키, 토큰이
   남지 않았는지 다시 확인한 뒤 전달한다.

도우미는 BlablaLink의 읽기 API만 7회 호출하고 결과를 로컬 파일로 저장한다. 외부 서버로
전송하거나 `document.cookie`를 읽지 않는다. 자동 익명화는 마지막 안전 검토를 대신하지 않는다.
쿠키 속성과 현재 차수는 자동으로 읽지 않으므로 아래 검증 2·4를 직접 기록해야 한다.

---

## 검증 1-A — 남의 길드 *레이드 기록* 조회 ★가장 중요

blablalink 유니온 레이드 페이지에서 `F12` → **Console** 탭.

```js
fetch('https://api.blablalink.com/api/game/proxy/Game/GetUnionRaidDataOfGuildSeason', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'content-type': 'application/json',
    'x-channel-type': '2',
    'x-language': 'ko',
    'x-common-params': '{"game_id":"16","area_id":"global","source":"pc_web","intl_game_id":"29080","language":"ko","env":"prod"}'
  },
  body: JSON.stringify({
    area_id: 83,
    guild_id: '남의길드ID',      // ← 유니온 스퀘어에서 아무 길드나
    season_id: '1000042'         // 정산이 끝난 차수여야 함
  })
}).then(r => r.json()).then(console.log);
```

### 판정

| 결과 | 의미 | 다음 |
|---|---|---|
| `data.participate_data` 에 배열이 참 | ✅ **기록 조회 성립** | 검증 1-B를 계속 진행 |
| `code !== 0` / 권한 오류 / 빈 배열 | ❌ 기록 조회 불성립 | 길드당 1회 온보딩 방식이 필요한지 검토 |

> ⚠️ 빈 배열이 나왔을 때는 **권한 문제인지 그 길드가 그 차수에 참여를 안 한 건지** 구분이
> 안 된다. 우리 길드 ID로 같은 차수를 조회해 정상 응답이 오는지 대조할 것.

---

## 검증 1-B — 남의 길드 *명단* 조회

레이드 기록과 길드원 명단은 **권한 정책이 다를 수 있다.** 따로 확인해야 한다.

```js
fetch('https://api.blablalink.com/api/game/proxy/Game/GetGuildMembers', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'content-type': 'application/json',
    'x-channel-type': '2',
    'x-language': 'ko',
    'x-common-params': '{"game_id":"16","area_id":"global","source":"pc_web","intl_game_id":"29080","language":"ko","env":"prod"}'
  },
  body: JSON.stringify({ guild_id: '남의길드ID', nikke_area_id: 83 })
}).then(r => r.json()).then(console.log);
```

명단이 `data.items` 또는 `items`에 배열로 오면 성공이다. 남의 길드 요청 직후
`guild_id`만 우리 길드 ID로 바꾼 대조군도 실행해 정상 응답과 모양을 비교한다.

**이게 왜 중요한가**: 미참여 체크는 명단이 있어야만 가능하다. 공격 기록만 보면
티켓을 안 쓴 사람은 화면에 아예 나타나지 않는다. 명단이 막히면 그 길드는
딜 순위·조합·추이는 다 보이지만 완전한 미참여 체크는 할 수 없다.

닉네임은 사용자가 입력하지 않는다. 명단 응답에서 현재 닉네임과 `openid`를,
레이드 기록에서 공격 시점의 닉네임과 `openid`를 확인한다. 사람을 연결하는 기준은
바뀔 수 있는 닉네임이 아니라 `openid`다.

### 두 검증을 합친 판정

| 1-A 기록 | 1-B 명단 | 설계 |
|---|---|---|
| ✅ | ✅ | **경로 A.** 서비스 계정 하나로 기록·명단을 모두 수집하고 정확한 미참여 체크 제공 |
| ✅ | ❌ | **경로 A′.** 순위·조합·추이는 제공하되, 미참여는 공격 기록에 등장한 사람 기준으로 축소하고 한계를 UI에 표시 |
| ❌ | — | **경로 B.** 길드 소속원 한 명이 최초 1회 연결하는 온보딩 방식 검토 |

---

## 검증 2 — 쿠키의 성격

`F12` → **Application** → 좌측 **Cookies** → `https://www.blablalink.com`

기록할 것:

| 항목 | 왜 필요한가 |
|---|---|
| 인증 쿠키 **이름** | 서버가 저장할 대상 |
| **HttpOnly** 체크 여부 | 체크돼 있으면 북마클릿이 `document.cookie` 로 못 읽는다 → 페이지 안에서 API를 직접 호출하고 결과 JSON만 보내는 방식으로 우회 |
| **Expires / Max-Age** | 한 달이면 갱신을 신경 쓸 필요가 거의 없다. 하루면 매일 눌러야 하니 설계가 달라진다 |

---

## 검증 3 — 응답 샘플 확보

아래 요청들의 **응답 JSON을 그대로** 저장해 `docs/samples/` 에 넣는다.
파싱 코드의 회귀 테스트 기준이 되고, 게임 패치로 스펙이 바뀌었을 때 비교 대상이 된다.

| 엔드포인트 | 언제 데이터가 나오나 | 확인할 것 |
|---|---|---|
| `GetUnionRaidDataOfGuildSeason` | **정산 끝난 시즌만** | `participate_data[]` 의 필드 구성 |
| `GetUnionRaidData` | **진행 중 시즌만** | 같은 구조인지, `total_damage` 가 문자열인지 |
| `GetUnionRaidLevelInfo` | 진행 중만 | `level_info[].boss_info[]` 의 `max_hp` / `current_hp` |
| `GetGuildMembers` | 상시 | 현재 닉네임·`openid`·명단 필드 (미참여 판정의 기준) |
| `GetUserInfoNew` | 상시 | `intl_openid` 형식 |

**특히 `squad` 배열의 실물이 필요하다.** 참여 상황 표에서 돋보기를 누르면 뜨는
스쿼드 상세(니케 5명·레벨·전투력)가 그것이다. 조합 분석 전체가 이 구조 위에 선다.

`Network` 탭에서 요청 우클릭 → **Copy as cURL** 이 가장 손실 없는 방법이다.
쿠키가 통째로 들어 있으니 **공개 저장소에 커밋하기 전에 반드시 지울 것.**
실제 `openid`와 닉네임도 회귀 테스트에 필요하지 않은 값으로 익명화한다.

---

## 검증 4 — 시즌 번호 확인

`season_id = 1000000 + 차수`.

`data/bosses.json` 은 43차까지 들어 있고, 43차 보스 배치는
`선바스 / 플레이트 / 토커티브 / 리빌드 핑거즈 / 마테리얼H` 다.
현재 게임 화면의 보스와 대조해 **지금이 몇 차인지** 확정한다.
자동 탐색의 시작점과 상한을 여기서 정한다.

---

## 결과 기록 — 2026-08-19 실측

로그인한 계정의 유니온은 정상 조회됐다. 명단은 32명, 정산된 35~43차 공격은
총 1,294건이었다. 현재 레이드가 열리지 않은 상태라 `manager_info.id`는 `"0"`,
현재 공격 배열은 비어 있었고 최신 정산 기록은 43차였다.

다른 유니온은 명단 요청이 API 코드 `1303003` 또는 `1303027`, 정산 기록 요청이
`1303028`로 거부됐다. 따라서 현재 운영 경로는 **로그인 계정 본인 유니온만 완전
자동 수집**하고, 다른 유니온에는 권한 제한을 표시하는 경로 B다. 레이드 진행 중
타 유니온 공격 기록의 별도 공개 여부는 다음 진행 시즌에 다시 확인한다.

인증에는 `.blablalink.com`의 `game_*` HttpOnly 쿠키 묶음이 사용된다. 값은 저장소나
샘플에 남기지 않고 Supabase의 `BLABLA_COOKIE` secret에만 저장했다. 현재 세션의
가장 이른 만료는 `2026-09-18T04:57:49Z`이며, 만료 전 운영 절차에 따라 교체한다.

원문에는 닉네임과 식별자가 있어 보관하지 않았다. 대신 필드명·건수·타입·권한
결과만 남긴 [비식별 shape 증거](samples/phase0-shape.json)를 저장했다. 1,294건
전체가 strict parser 범위를 통과했고, 기존 공격 고유키로는 1건이 충돌한다는 것도
확인해 수집 구현은 응답 배열 순번을 원본 키에 포함한다. 명단의 `bind_area_id`는
31명이 `83`, 1명이 미연동 sentinel `0`이어서 두 값만 허용하도록 검증했다.

```
검증 1-A 남의 길드 정산 기록 [x] 불가 (진행 시즌은 다음 레이드에 재검증)
검증 1-B 남의 길드 명단      [x] 불가
          우리 길드 대조군    [x] 정상 응답 확인
검증 2  쿠키                  [x] game_* HttpOnly 묶음, secret 저장
        만료                  2026-09-18T04:57:49Z
검증 3  비식별 shape          [x] docs/samples/phase0-shape.json
검증 4  최신 정산 차수        43차
```
