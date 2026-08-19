# NikkeURaid

승리의 여신: 니케 유니온 레이드 기록을 확인하는 비공식 팬 대시보드입니다.

**바로 사용:** <https://nikkeuraid.vercel.app>

## 사용 방법

1. 서버를 선택합니다.
2. 게임에 표시되는 숫자 유니온 ID를 입력합니다.
3. `조회`를 누릅니다.

처음 조회하는 유니온은 자동 수집을 요청합니다. 화면이 `대기 중(pending)` → `수집 중(syncing)` 상태를 자동으로 확인하고, 완료되면 대시보드로 이동합니다. 닉네임과 참여 기록은 수집 결과에 포함되므로 따로 입력할 필요가 없습니다.

## 현재 조회 범위

현재 연결된 BlablaLink 세션에서는 **본인 유니온만 명단과 레이드 기록을 완전히 조회**할 수 있습니다. 다른 유니온은 BlablaLink 권한 정책에 따라 조회가 제한되며, 앱에서 권한 부족·세션 만료·존재하지 않는 유니온을 오류로 안내합니다.

## 로컬 실행

Node.js 20.9 이상이 필요합니다. 저장소를 받은 뒤 다음 세 명령을 실행하세요.

```bash
cd NikkeURaid
npm install
npm run dev
```

브라우저에서 <http://localhost:3000>을 엽니다. 환경변수가 없으면 샘플 데이터로 실행됩니다.

## 필수 환경변수

실데이터를 연결할 때 아래 이름을 `.env.local` 또는 Vercel 환경변수에 설정합니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

비밀값은 저장소에 커밋하지 마세요. Supabase 배포와 BlablaLink 세션 갱신 절차는 [운영 문서](docs/operations.md)를 참고하세요.

## 문서

- [구현 명세](docs/IMPLEMENTATION.md)
- [운영 절차](docs/operations.md)

비상업 팬 프로젝트이며 공식 서비스와 관계가 없습니다.
