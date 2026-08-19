# NikkeURaid 운영 절차

이 문서는 실데이터 수집 배포, BlablaLink 세션 갱신, 운영자 화면 잠금과 무료 Supabase 용량 한도 전
정리 절차를 다룬다. Phase 0 API 계약과 Supabase 연결은 검증됐으며, `/admin`의 큐 제어와 계수 저장은
아직 읽기 전용이다.

## 실데이터 수집 배포

Vercel 서버에는 다음 세 환경변수가 필요하다. `SUPABASE_SERVICE_ROLE_KEY`에는 절대
`NEXT_PUBLIC_` 접두사를 붙이지 않는다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Supabase Edge Functions에는 `BLABLA_COOKIE`와 `INTERNAL_SYNC_SECRET`을 secret으로 설정한다.
값은 저장소, 셸 기록, 로그에 남기지 않는다. 연결된 Supabase 프로젝트에 DB와 함수 세 개를 배포한다.

```powershell
npx.cmd --yes supabase@latest login
npx.cmd --yes supabase@latest link --project-ref <PROJECT_REF>
npx.cmd --yes supabase@latest db push --linked
npx.cmd --yes supabase@latest functions deploy collect --project-ref <PROJECT_REF>
npx.cmd --yes supabase@latest functions deploy dispatch --project-ref <PROJECT_REF>
npx.cmd --yes supabase@latest functions deploy request-sync --project-ref <PROJECT_REF>
```

위 명령은 이미 열린 PowerShell에서 한 줄씩 실행한다. 자동화 환경에서는 대화형 로그인 대신
`SUPABASE_ACCESS_TOKEN`을 비밀 환경변수로 주입한다.

`request-sync`는 최초 조회 등록과 즉시 수집 요청, `collect`는 한 유니온의 원자적 수집,
`dispatch`는 갱신 대상 묶음 처리를 담당한다. 배포 뒤 Vercel에서 유니온을 조회해
`pending` → `syncing` → `ok` 전환과 `sync_log` 기록을 확인한다.

## BlablaLink 세션 갱신

저장소 루트에서 `npm run session:update`를 실행하고 열린 전용 Edge 창에서 로그인한다. 이미 로그인된
전용 프로필이면 쿠키 값을 출력하거나 자식 프로세스 명령행에 넣지 않고, 사용자 임시 폴더의 일회용
env 파일을 통해 Supabase의 `BLABLA_COOKIE` secret을 갱신한 뒤 즉시 삭제한다.
세션 만료 전 또는 화면에 세션 만료 오류가 표시될 때 다시 실행한다.

## 운영자 화면 잠금

서버 전용 환경변수 두 개가 모두 안전한 길이로 설정되어야 `/admin` 로그인 폼이 열린다.

| 변수 | 최소 조건 | 용도 |
|---|---:|---|
| `ADMIN_PASSWORD` | 12자 | 운영자 비밀번호. 20자 이상의 고유 문구 권장 |
| `ADMIN_SESSION_SECRET` | 32바이트 | 세션 쿠키 HMAC 서명. 비밀번호와 다른 무작위 값 사용 |

- 변수명에 `NEXT_PUBLIC_`을 붙이지 않는다. 붙이면 클라이언트 번들에 노출될 수 있다.
- 로컬에서는 Git에 포함되지 않는 `.env.local`에 저장하고, 배포에서는 Vercel의 암호화된 환경변수에
  저장한 뒤 재배포한다.
- 무작위 서명 키는 `openssl rand -base64 48`처럼 CSPRNG로 만든다. 출력값을 문서나 이슈에 붙이지 않는다.
- 설정이 없거나 짧으면 `/admin`은 로그인 입력 자체를 표시하지 않고 부족한 변수명만 안내한다.
- 로그인 성공 시 8시간짜리 HttpOnly·SameSite=Strict 서명 쿠키를 `/admin` 경로에만 발급한다.
  프로덕션에서는 Secure도 강제된다.
- `ADMIN_SESSION_SECRET`을 교체하면 기존 운영자 세션이 즉시 무효화된다. 운영자 교체나 노출 의심 시
  비밀번호와 서명 키를 함께 회전한다.

비밀번호는 Server Action에서만 검증되며 입력값을 저장하거나 로그로 남기지 않는다. 공개 운영 전에는
Vercel Deployment Protection 또는 동등한 속도 제한도 추가한다. 현재의 실패 지연은 분산 공격에 대한
완전한 속도 제한이 아니다.

## 운영 기능 해제 게이트

아래 순서를 모두 통과하기 전에는 세션 갱신, 큐 제어, 계수 저장 버튼을 활성화하지 않는다.

1. Phase 0의 API 응답과 타 유니온 권한을 다시 확인하고 쿠키·openid·닉네임을 익명화한다.
2. Supabase 프로젝트에서 마이그레이션·RLS·`auth_session` anon 차단을 실제로 검증한다.
3. 모든 쓰기가 `service_role` 전용 서버 API를 통하고 성공·실패가 `sync_log`에 남는지 검증한다.
4. 운영자 변경 요청에 CSRF 방어, 입력 검증, 재인증 또는 감사 로그를 붙인다.

UI가 버튼을 활성화해 보이더라도 위 조건의 서버측 강제가 없으면 완료로 보지 않는다.

## 5.5 용량 정리 정책

### 기준

- 매주 DB 전체 크기와 `attacks` 테이블 크기를 기록한다.
- 350MB부터 주의, 400MB부터 정리 dry-run, 450MB부터 신규 길드 확대를 중단한다.
- `last_viewed`가 90일 넘은 길드는 수집 큐에서 제외하되 데이터는 즉시 삭제하지 않는다.
- 원문 공격 기록은 기본적으로 최근 12개 완료 시즌을 유지한다. 더 오래된 시즌은 요약과 복구 백업이
  모두 검증된 범위만 정리 후보로 삼는다.
- 자동 삭제 크론을 두지 않는다. 한 번에 한 길드·한 시즌 범위로 운영자가 승인해 처리한다.

다음 읽기 전용 조회로 후보와 예상 효과를 먼저 확인할 수 있다.

```sql
select pg_size_pretty(pg_database_size(current_database())) as database_size,
       pg_size_pretty(pg_total_relation_size('public.attacks')) as attacks_size;

select area_id, guild_id, name, last_viewed, last_synced, sync_state
from public.guilds
where coalesce(last_viewed, first_seen) < now() - interval '90 days'
  and sync_state <> 'dead'
order by last_viewed nulls first;

select area_id, guild_id, season, count(*) as raw_rows,
       min(captured_at) as first_attack, max(captured_at) as last_attack
from public.attacks
group by area_id, guild_id, season
order by season, area_id, guild_id;
```

위 SQL은 후보를 읽을 뿐이다. 이 문서에는 광범위한 `delete`나 자동 실행 SQL을 두지 않는다.

### 1. Dry-run

1. 실행 티켓에 정확한 `(area_id, guild_id, season)` 목록과 예상 원문 행 수를 고정한다.
2. 90일 미조회 길드는 `dead` 전환 후보와 최근 조회 길드를 분리한다. 신규 조회가 오면 다시
   `pending`으로 복구할 경로가 준비되어 있어야 한다.
3. 정리 대상별 `v_season_totals`와 멤버별 시즌 합계를 별도 결과물로 생성한다.
4. 대상 행 수, 시즌 요약 합계, 예상 절감량을 기록한다. 전체 테이블이나 열린 범위 조건은 승인하지 않는다.

### 2. 요약 보존 준비

원문을 지우면 현재 `v_season_totals`와 `v_member_growth`도 함께 사라진다. 따라서 삭제 전에 별도
마이그레이션으로 불변 요약 테이블을 만들고 다음 최소 데이터를 저장해야 한다.

- 길드 시즌 요약: 지역, 길드, 시즌, 총딜, 공격 수, 참가자 수, 보스 수, 마지막 공격 시각
- 멤버 시즌 요약: 지역, 길드, 시즌, openid, 당시 닉네임, 총딜, 최대 싱크로 레벨
- 생성 시각, 원문 행 수, 원문 범위 해시, 백업 위치

요약 테이블의 유니크 키와 공개 읽기 RLS를 검토하고, 같은 범위를 두 번 요약해도 중복되지 않는지
테스트한다. 이 테이블이 실제 배포되기 전에는 원문을 삭제하지 않는다.

### 3. 백업

1. 대상 원문을 정확한 복합 키 범위로 압축 내보내기하고 SHA-256을 기록한다.
2. 길드·시즌 요약을 주간 Google Sheets 백업에도 반영한다. Sheets는 원문 전체의 유일한 백업으로
   사용하지 않는다.
3. 별도 환경에서 표본 복원을 실행해 행 수·딜 합계·해시를 확인한다.
4. 백업 위치, 체크섬, 복원 확인자를 실행 티켓에 남긴다.

### 4. 확인과 실행

운영자가 다음 다섯 값을 보고 명시적으로 승인해야 한다: 대상 복합 키, 원문 행 수, 요약 행 수,
백업 체크섬, 예상 절감량. 승인 후에도 자동 크론이 아니라 검토된 일회성 서버 작업으로 처리한다.

- 90일 미조회 길드는 먼저 `sync_state='dead'`로 전환해 큐에서만 제외한다.
- 원문 정리는 한 길드·한 시즌씩 짧은 트랜잭션과 제한된 배치로 수행한다.
- 대상 조건은 dry-run에서 고정한 복합 키와 정확히 같아야 한다.
- `VACUUM FULL`처럼 장시간 잠금을 유발하는 작업은 서비스 중 실행하지 않는다.

### 5. 사후 검증과 중단 조건

1. 실제 정리 행 수가 dry-run 행 수와 다르면 즉시 중단하고 다음 범위를 처리하지 않는다.
2. 보존된 길드·멤버 요약의 총딜과 원문 dry-run 합계가 일치하는지 확인한다.
3. 최근 12개 시즌의 개요·조합·추이 화면이 변하지 않았는지 확인한다.
4. 오래된 시즌 UI에는 원문 조합 상세가 보존되지 않았음을 명시하고 요약만 표시한다.
5. DB 크기는 autovacuum 반영 후 다시 측정한다. 즉시 줄지 않았다는 이유로 추가 삭제하지 않는다.
6. 불일치가 있으면 백업으로 복원하고 원인과 영향 범위를 `sync_log` 및 변경 기록에 남긴다.

## 정기 운영 체크리스트

- [ ] Phase 0/API 계약 변경 여부 확인
- [ ] `auth_required` 및 `dead` 길드 확인
- [ ] DB·`attacks` 용량과 30일 증가율 기록
- [ ] 90일 미조회 길드 dry-run 검토
- [ ] 주간 요약 백업과 복원 표본 확인
- [ ] 운영자 비밀번호·서명 키 접근자 검토
