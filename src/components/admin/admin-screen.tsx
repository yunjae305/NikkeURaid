import Link from "next/link";
import type { ReactNode } from "react";

import { lockAdmin, unlockAdmin } from "@/app/admin/actions";
import styles from "@/app/admin/admin.module.css";
import { BrandMark } from "@/components/shared/brand-mark";
import {
  AlertTriangleIcon,
  ClockIcon,
  LockIcon,
  UsersIcon,
} from "@/components/shared/icons";
import { ThemeToggle } from "@/components/shared/theme-toggle";

type AdminScreenState =
  | { kind: "setup"; issues: string[] }
  | { kind: "locked"; invalidPassword: boolean }
  | { kind: "unlocked" };

function SlidersIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M4 7h8M16 7h4M4 17h4M12 17h8" />
      <circle cx="14" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

function AdminHeader() {
  return (
    <header className={`site-header ${styles.header}`}>
      <Link className="brand-link" href="/" aria-label="NikkeURaid 홈">
        <BrandMark />
        <span>NikkeURaid</span>
      </Link>
      <div className={styles.headerActions}>
        <span className={styles.adminLabel}>운영자 도구</span>
        <ThemeToggle />
      </div>
    </header>
  );
}

function AdminFooter() {
  return (
    <footer className={styles.footer}>
      <p>운영 절차와 환경변수는 저장소의 docs/operations.md에서 확인하세요.</p>
      <Link href="/">대시보드로 돌아가기</Link>
    </footer>
  );
}

function SetupPanel({ issues }: { issues: string[] }) {
  return (
    <main className={styles.centeredMain}>
      <section className={styles.lockCard} aria-labelledby="admin-setup-title">
        <span className={styles.heroIcon}>
          <AlertTriangleIcon aria-hidden="true" />
        </span>
        <p className={styles.eyebrow}>CONFIGURATION REQUIRED</p>
        <h1 id="admin-setup-title">운영자 잠금이 아직 설정되지 않았습니다.</h1>
        <p className={styles.lead}>
          이 상태에서는 로그인과 운영 기능을 모두 닫습니다. 서버 환경에 아래 두 값을
          설정한 뒤 다시 배포하세요.
        </p>

        <div className={styles.setupList} role="status">
          {issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>

        <div className={styles.variableGrid} aria-label="필수 서버 환경변수" role="group">
          <div>
            <code>ADMIN_PASSWORD</code>
            <span>운영자 비밀번호 · 최소 12자</span>
          </div>
          <div>
            <code>ADMIN_SESSION_SECRET</code>
            <span>쿠키 서명 키 · 최소 32바이트</span>
          </div>
        </div>

        <aside className={styles.securityNote}>
          <LockIcon aria-hidden="true" />
          <p>
            두 변수에는 <code>NEXT_PUBLIC_</code> 접두사를 붙이지 마세요. 값은 클라이언트
            코드에 포함되지 않습니다.
          </p>
        </aside>
      </section>
    </main>
  );
}

function LoginPanel({ invalidPassword }: { invalidPassword: boolean }) {
  return (
    <main className={styles.centeredMain}>
      <section className={styles.lockCard} aria-labelledby="admin-login-title">
        <span className={styles.heroIcon}>
          <LockIcon aria-hidden="true" />
        </span>
        <p className={styles.eyebrow}>RESTRICTED AREA</p>
        <h1 id="admin-login-title">운영자 확인이 필요합니다.</h1>
        <p className={styles.lead}>
          세션과 큐 상태를 다루는 화면입니다. 비밀번호는 서버에서만 검증합니다.
        </p>

        {invalidPassword ? (
          <p className={styles.loginError} role="alert">
            비밀번호를 확인해 주세요. 입력값은 저장하지 않았습니다.
          </p>
        ) : null}

        <form action={unlockAdmin} className={styles.loginForm}>
          <label htmlFor="admin-password">운영자 비밀번호</label>
          <input
            autoComplete="current-password"
            id="admin-password"
            maxLength={256}
            name="password"
            required
            spellCheck={false}
            type="password"
          />
          <button type="submit">잠금 해제</button>
        </form>

        <p className={styles.sessionHint}>
          성공하면 8시간 동안 유지되는 HttpOnly 서명 쿠키를 발급합니다.
        </p>
      </section>
    </main>
  );
}

function DisabledActionCard({
  children,
  icon,
  id,
  status,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  id: string;
  status: string;
  title: string;
}) {
  return (
    <section className={styles.actionCard} aria-labelledby={`${id}-title`}>
      <div className={styles.cardHeading}>
        <span className={styles.cardIcon}>{icon}</span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <span className={styles.statusChip}>{status}</span>
        </div>
      </div>
      {children}
    </section>
  );
}

function AdminConsole() {
  return (
    <main className={styles.consoleMain}>
      <div className={styles.consoleHeading}>
        <div>
          <p className={styles.eyebrow}>OPERATIONS</p>
          <h1>운영 상태</h1>
          <p>외부 연결 전까지 상태를 확인하되 어떤 데이터도 변경하지 않습니다.</p>
        </div>
        <form action={lockAdmin}>
          <button className={styles.logoutButton} type="submit">
            잠그고 나가기
          </button>
        </form>
      </div>

      <aside className={styles.readonlyBanner} role="status">
        <AlertTriangleIcon aria-hidden="true" />
        <div>
          <strong>읽기 전용 준비 화면입니다.</strong>
          <p>Phase 0 응답 샘플과 Supabase 연결이 확인될 때까지 모든 외부 작업을 잠급니다.</p>
        </div>
        <span>외부 쓰기 0건</span>
      </aside>

      <div className={styles.cardGrid}>
        <DisabledActionCard
          icon={<ClockIcon aria-hidden="true" />}
          id="admin-session"
          status="Phase 0 대기"
          title="세션 갱신"
        >
          <p className={styles.cardDescription}>
            BlablaLink 쿠키의 이름·HttpOnly·만료 정책을 아직 확인하지 않았습니다.
          </p>
          <dl className={styles.detailList}>
            <div>
              <dt>저장된 세션</dt>
              <dd>연결 전</dd>
            </div>
            <div>
              <dt>마지막 확인</dt>
              <dd>—</dd>
            </div>
          </dl>
          <button className={styles.disabledButton} disabled type="button">
            세션 갱신 준비 중
          </button>
        </DisabledActionCard>

        <DisabledActionCard
          icon={<UsersIcon aria-hidden="true" />}
          id="admin-queue"
          status="Supabase 미연결"
          title="수집 큐"
        >
          <p className={styles.cardDescription}>
            디스패처와 pg_cron이 아직 없어 실시간 큐 수치를 만들지 않습니다.
          </p>
          <dl className={styles.detailList}>
            <div>
              <dt>대기 길드</dt>
              <dd>—</dd>
            </div>
            <div>
              <dt>오류 길드</dt>
              <dd>—</dd>
            </div>
          </dl>
          <button className={styles.disabledButton} disabled type="button">
            큐 연결 후 확인
          </button>
        </DisabledActionCard>

        <DisabledActionCard
          icon={<SlidersIcon />}
          id="admin-coefficients"
          status="편집 잠김"
          title="시즌 계수"
        >
          <p className={styles.cardDescription}>
            현재 시드는 40차만 포함합니다. 쓰기 권한과 감사 경로가 생기기 전에는 값을
            수정하지 않습니다.
          </p>
          <fieldset className={styles.coefficientFields} disabled>
            <legend className="sr-only">시즌 계수 편집</legend>
            <label>
              시즌
              <select defaultValue="">
                <option value="">연결 후 선택</option>
              </select>
            </label>
            <label>
              Step 1 계수
              <input inputMode="decimal" placeholder="—" type="text" />
            </label>
          </fieldset>
          <button className={styles.disabledButton} disabled type="button">
            계수 저장 비활성
          </button>
        </DisabledActionCard>
      </div>

      <aside className={styles.nextGate}>
        <LockIcon aria-hidden="true" />
        <div>
          <strong>다음 해제 조건</strong>
          <p>
            Phase 0 샘플 익명화 → Supabase RLS 검증 → service_role 전용 API와 감사 로그 확인
            순으로 통과해야 합니다.
          </p>
        </div>
      </aside>
    </main>
  );
}

export function AdminScreen({ state }: { state: AdminScreenState }) {
  return (
    <div className={styles.page}>
      <AdminHeader />
      {state.kind === "setup" ? <SetupPanel issues={state.issues} /> : null}
      {state.kind === "locked" ? (
        <LoginPanel invalidPassword={state.invalidPassword} />
      ) : null}
      {state.kind === "unlocked" ? <AdminConsole /> : null}
      <AdminFooter />
    </div>
  );
}
