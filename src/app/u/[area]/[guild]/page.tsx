import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  DashboardShell,
  type DashboardTab,
} from "@/components/dashboard/dashboard-shell";
import { GuildLookupStart } from "@/components/dashboard/guild-lookup-start";
import { getArea, isAreaId } from "@/lib/areas";
import { getDashboardModel, getGuildSummary } from "@/lib/data";

type RouteParams = Promise<{ area: string; guild: string }>;
type RouteSearchParams = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInteger(value: string | string[] | undefined) {
  const text = scalar(value);
  if (!text || !/^\d+$/.test(text)) return undefined;
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function parseTab(value: string | string[] | undefined): DashboardTab {
  const tab = scalar(value);
  return tab === "combos" || tab === "trend" ? tab : "overview";
}

function validateRoute(area: string, guild: string) {
  if (!isAreaId(area) || !/^\d{1,12}$/.test(guild)) notFound();
  return { areaId: Number(area) as 81 | 82 | 83 | 84 | 85, guildId: guild };
}

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  const { area, guild } = await params;
  if (!isAreaId(area) || !/^\d{1,12}$/.test(guild)) return { title: "유니온 기록" };
  const summary = await getGuildSummary(Number(area) as 81 | 82 | 83 | 84 | 85, guild);
  return {
    title: summary ? `${summary.name} 유니온 기록` : "유니온 기록",
    description: `${summary?.name ?? `유니온 ${guild}`}의 레이드 딜 순위, 미참여, 조합과 시즌 추이를 확인하세요.`,
  };
}

export default async function GuildDashboardPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: RouteSearchParams;
}) {
  const [{ area, guild }, query] = await Promise.all([params, searchParams]);
  const route = validateRoute(area, guild);
  const day = parsePositiveInteger(query.day);
  const model = await getDashboardModel({
    ...route,
    season: parsePositiveInteger(query.season),
    day: day === 1 || day === 2 ? day : undefined,
  });

  if (!model) {
    return (
      <GuildLookupStart
        areaId={route.areaId}
        areaName={getArea(route.areaId).name}
        guildId={route.guildId}
      />
    );
  }

  const activeTab = parseTab(query.tab);
  const requestedSeason = parsePositiveInteger(query.season);
  const requestedDay = parsePositiveInteger(query.day);
  const requestedTab = scalar(query.tab);

  if (
    model.periods.length > 0 &&
    (requestedSeason !== model.selectedPeriod.season ||
      requestedDay !== model.selectedPeriod.day ||
      (requestedTab !== undefined && requestedTab !== activeTab))
  ) {
    const canonicalQuery = new URLSearchParams({
      season: String(model.selectedPeriod.season),
      day: String(model.selectedPeriod.day),
    });
    if (activeTab !== "overview") canonicalQuery.set("tab", activeTab);
    redirect(`/u/${route.areaId}/${route.guildId}?${canonicalQuery}`);
  }

  return <DashboardShell model={model} activeTab={activeTab} />;
}
