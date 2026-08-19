# NikkeURaid

승리의 여신: 니케 유니온 레이드 기록 대시보드입니다. 서버와 유니온 ID로 딜 순위, 남은 티켓, 조합 분석, 시즌 추이를 확인합니다.

**실서비스:** <https://nikkeuraid.vercel.app>

웹앱과 Supabase 운영 DB는 배포됐습니다. 현재는 BlablaLink 실데이터 수집기 연결 전이라 등록되지 않은 유니온은 데이터 없음으로 표시됩니다. [Phase 0 권한 검증](docs/phase0-verification.md)이 끝나면 ID 최초 조회와 자동 갱신을 연결합니다.

## 실행

Node.js 20.9 이상이 필요합니다.

```bash
git clone https://github.com/yunjae305/NikkeURaid.git
cd NikkeURaid
npm install
npm run dev
```

브라우저에서 <http://localhost:3000>을 엽니다. 환경변수가 없으면 익명 샘플 데이터로 바로 실행됩니다.

Windows PowerShell 실행 정책으로 명령이 막히면 `npm` 대신 `npm.cmd`, `npx` 대신 `npx.cmd`를 사용하세요.

## 실제 DB 연결

`.env.example`을 `.env.local`로 복사하고 두 값을 함께 설정합니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

둘 중 하나만 설정하면 구성 오류로 중단합니다. 실제 DB 조회가 실패해도 샘플로 몰래 전환하지 않습니다.

로컬 Supabase는 Docker를 실행한 뒤 다음 순서로 준비합니다.

```bash
npx supabase start
npx supabase db reset
```

## 확인 명령

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

시드 원본을 수정했다면 다음 명령으로 SQL을 다시 만듭니다.

```bash
python -B scripts/generate_seed.py
```

정상 수량은 니케 196행, 시즌 보스 45행, 계수 5행입니다. `supabase/seed/*.sql`은 직접 수정하지 않습니다.

## 구현 상태

| 영역 | 상태 |
|---|---|
| 랜딩·개요·조합·추이·OG·PWA | Vercel 배포 완료 |
| Supabase 스키마·뷰·시드·권한 | 서울 리전 운영 DB 적용 완료 |
| 운영자 화면 | 서버 비밀번호 잠금 완료, 외부 작업은 비활성 |
| BlablaLink 실제 수집기·스케줄러 | Phase 0 결과 대기 |
| Supabase·Vercel 실배포 | 완료 |

닉네임은 손으로 입력하지 않습니다. 명단과 공격 기록에서 자동 수집하고, 공격 기록의 `openid`를 중심으로 동일인을 연결합니다. 명단 응답의 실제 식별자 매핑은 Phase 0 샘플로 최종 확정합니다.

실데이터 연결에 필요한 결과는 로그인한 BlablaLink 페이지에서 [Phase 0 도우미](docs/phase0-console.js)를 실행해 받을 수 있습니다.

## 문서

- [구현 명세](docs/IMPLEMENTATION.md)
- [Phase 0 검증 절차](docs/phase0-verification.md)
- [운영 및 용량 정리](docs/operations.md)
- [전체 계획](docs/PLAN.md)

비상업 팬 프로젝트이며 공식 서비스와 관계가 없습니다.
