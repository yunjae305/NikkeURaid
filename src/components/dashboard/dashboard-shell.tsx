import Link from "next/link";

import { ComboPanel } from "@/components/dashboard/combo-panel";
import { OverviewPanel } from "@/components/dashboard/overview-panel";
import { RememberGuild } from "@/components/dashboard/remember-guild";
import { StatusBanner } from "@/components/dashboard/status-banner";
import { TrendPanel } from "@/components/dashboard/trend-panel";
import { BrandMark } from "@/components/shared/brand-mark";
import { ArrowLeftIcon, ClockIcon, UsersIcon } from "@/components/shared/icons";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { getArea } from "@/lib/areas";
import { formatRelativeTime } from "@/lib/format";
import type { DashboardModel } from "@/lib/types";

export type DashboardTab = "overview" | "combos" | "trend";

const tabs: Array<{ id: DashboardTab; label: string }> = [
  { id: "overview", label: "개요" },
  { id: "combos", label: "조합" },
  { id: "trend", label: "추이" },
];

function dashboardHref(
  model: DashboardModel,
  tab: DashboardTab,
  period = model.selectedPeriod,
) {
  const params = new URLSearchParams({
    season: String(period.season),
    day: String(period.day),
  });
  if (tab !== "overview") params.set("tab", tab);
  return `/u/${model.guild.areaId}/${model.guild.guildId}?${params}`;
}

export function DashboardShell({
  model,
  activeTab,
}: {
  model: DashboardModel;
  activeTab: DashboardTab;
}) {
  const area = getArea(model.guild.areaId);

  return (
    <div className="dashboard-page">
      <RememberGuild guild={model.guild} />
      <header className="site-header dashboard-topbar">
        <Link className="brand-link" href="/" aria-label="NikkeURaid 홈">
          <BrandMark />
          <span>NikkeURaid</span>
        </Link>
        <div className="topbar-actions">
          <Link className="back-link" href="/">
            <ArrowLeftIcon aria-hidden="true" />
            다른 유니온
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="dashboard-main">
        <section className="guild-hero" aria-labelledby="guild-title">
          <div>
            <div className="guild-meta-row">
              <span>{area.name} 서버</span>
              <span>ID {model.guild.guildId}</span>
            </div>
            <h1 id="guild-title">{model.guild.name}</h1>
            <div className="guild-subline">
              <span><UsersIcon aria-hidden="true" /> {model.guild.memberCount}명</span>
              <span><ClockIcon aria-hidden="true" /> {formatRelativeTime(model.guild.lastSyncedAt)}</span>
            </div>
          </div>
          <div className="period-picker" aria-label="레이드 기간 선택" role="group">
            {model.periods.map((period) => {
              const selected =
                period.season === model.selectedPeriod.season &&
                period.day === model.selectedPeriod.day;
              return (
                <Link
                  key={`${period.season}-${period.day}`}
                  href={dashboardHref(model, activeTab, period)}
                  aria-current={selected ? "page" : undefined}
                >
                  <strong>{period.season}차</strong>
                  <span>Day {period.day}</span>
                </Link>
              );
            })}
          </div>
        </section>

        <StatusBanner model={model} />

        <nav className="dashboard-tabs" aria-label="대시보드 보기">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={dashboardHref(model, tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {activeTab === "overview" ? <OverviewPanel model={model} /> : null}
        {activeTab === "combos" ? <ComboPanel combos={model.combos} /> : null}
        {activeTab === "trend" ? <TrendPanel trend={model.trend} /> : null}
      </main>

      <footer className="site-footer">
        <p>비상업 팬 프로젝트 · 게임 내 공개 정보만 다룹니다.</p>
        <Link href="/admin">운영자</Link>
      </footer>
    </div>
  );
}
