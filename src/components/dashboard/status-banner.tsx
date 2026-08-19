import Link from "next/link";

import { SyncRefresh } from "@/components/dashboard/sync-refresh";
import { AlertTriangleIcon, ClockIcon } from "@/components/shared/icons";
import type { DashboardModel } from "@/lib/types";

export function getStatusBannerKind(
  model: Pick<DashboardModel, "source" | "status">,
) {
  if (model.status === "syncing") return "syncing" as const;
  if (model.status === "auth-required" || model.status === "dead") {
    return "warning" as const;
  }
  if (model.source === "mock") return "preview" as const;
  return "none" as const;
}

export function StatusBanner({ model }: { model: DashboardModel }) {
  const kind = getStatusBannerKind(model);

  if (kind === "syncing") {
    const pending = model.guild.syncState === "pending";
    return (
      <aside className="status-banner syncing-banner" role="status" aria-live="polite">
        <span className="status-spinner" aria-hidden="true" />
        <div>
          <strong>
            {pending
              ? "수집 요청이 접수되었습니다."
              : "첫 기록을 수집하고 있습니다."}
          </strong>
          <p>
            {pending
              ? "수집 순서를 기다리는 중입니다. 이 화면에서 5초마다 상태를 확인합니다."
              : "완료되면 최신 기록을 이 화면에 자동으로 표시합니다."}
          </p>
          <span
            aria-label={pending ? "유니온 수집 대기 중" : "첫 기록 수집 진행 중"}
            className="sync-progress"
            role="progressbar"
          >
            <span aria-hidden="true" />
          </span>
        </div>
        <SyncRefresh />
      </aside>
    );
  }

  if (kind === "warning") {
    return (
      <aside className="status-banner warning-banner" role="alert">
        <AlertTriangleIcon aria-hidden="true" />
        <div>
          <strong>데이터 갱신이 잠시 멈췄습니다.</strong>
          <p>
            {model.status === "auth-required"
              ? "운영자 로그인 세션 갱신이 필요합니다. 저장된 기록은 계속 볼 수 있습니다."
              : "반복 오류로 자동 수집이 중단됐습니다. 운영자 확인이 필요합니다."}
          </p>
        </div>
      </aside>
    );
  }

  if (kind === "preview") {
    return (
      <aside className="status-banner preview-banner" role="status">
        <ClockIcon aria-hidden="true" />
        <div>
          <strong>샘플 데이터로 보는 화면입니다.</strong>
          <p>실제 조회는 Phase 0 API 권한 검증과 수집기 연결 후 열립니다.</p>
        </div>
        <Link href="/">다른 ID 찾기</Link>
      </aside>
    );
  }

  return null;
}
