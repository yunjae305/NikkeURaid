import {
  getMockAvailablePeriods,
  getMockDashboardModel,
  getMockGuildSummary,
} from "./mock-data";
import {
  createReadonlySupabaseClient,
  resolveSupabaseConfig,
} from "./supabase/client";
import {
  getSupabaseAvailablePeriods,
  getSupabaseDashboardModel,
  getSupabaseGuildSummary,
} from "./supabase/repository";
import type {
  AreaId,
  DashboardModel,
  DashboardQuery,
  DataSource,
  GuildSummary,
  RaidPeriod,
} from "./types";

export function getConfiguredDataSource(): DataSource {
  return resolveSupabaseConfig() ? "supabase" : "mock";
}

export async function getGuildSummary(
  areaId: AreaId,
  guildId: string,
): Promise<GuildSummary | null> {
  const config = resolveSupabaseConfig();
  if (!config) return getMockGuildSummary(areaId, guildId);

  return getSupabaseGuildSummary(
    createReadonlySupabaseClient(config),
    areaId,
    guildId,
  );
}

export async function getAvailablePeriods(
  areaId: AreaId,
  guildId: string,
): Promise<RaidPeriod[]> {
  const config = resolveSupabaseConfig();
  if (!config) return getMockAvailablePeriods();

  return getSupabaseAvailablePeriods(
    createReadonlySupabaseClient(config),
    areaId,
    guildId,
  );
}

export async function getDashboardModel(
  query: DashboardQuery,
): Promise<DashboardModel | null> {
  const config = resolveSupabaseConfig();
  if (!config) return getMockDashboardModel(query);

  return getSupabaseDashboardModel(createReadonlySupabaseClient(config), query);
}
