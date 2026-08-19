import type { SupabaseClient } from "@supabase/supabase-js";

import { assetUrl } from "../assets";
import type {
  AreaId,
  BossProgress,
  ComboRanking,
  DashboardModel,
  DashboardQuery,
  DashboardStatus,
  GuildSummary,
  MemberGrowth,
  MemberRanking,
  NikkeUsage,
  ParticipationMember,
  RaidPeriod,
  RosterState,
  SeasonTrend,
  SyncState,
} from "../types";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

export class SupabaseReadError extends Error {
  readonly operation: string;

  constructor(operation: string, message: string) {
    super(`Supabase 읽기 실패 (${operation}): ${message}`);
    this.name = "SupabaseReadError";
    this.operation = operation;
  }
}

interface ReadResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function requireData<T>(result: ReadResult<T>, operation: string): T {
  if (result.error) {
    throw new SupabaseReadError(operation, result.error.message);
  }
  if (result.data === null) {
    throw new SupabaseReadError(operation, "응답 데이터가 없습니다.");
  }
  return result.data;
}

function asSyncState(value: string): SyncState {
  if (
    value === "pending" ||
    value === "syncing" ||
    value === "ok" ||
    value === "auth_required" ||
    value === "dead"
  ) {
    return value;
  }
  throw new SupabaseReadError("guilds", `알 수 없는 sync_state: ${value}`);
}

function asRosterState(value: string): RosterState {
  if (value === "unknown" || value === "complete" || value === "limited") {
    return value;
  }
  throw new SupabaseReadError("guilds", `알 수 없는 roster_state: ${value}`);
}

function dashboardStatus(syncState: SyncState): DashboardStatus {
  if (syncState === "auth_required") return "auth-required";
  if (syncState === "dead") return "dead";
  if (syncState === "pending" || syncState === "syncing") return "syncing";
  return "ready";
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new SupabaseReadError("숫자 변환", `유효하지 않은 숫자: ${value}`);
  }
  return numberValue;
}

function percentChange(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function aggregateBossAttacks(
  rows: ReadonlyArray<{ boss: string; total_damage: number | string }>,
) {
  const result = new Map<string, { damage: number; attacks: number }>();
  for (const row of rows) {
    const current = result.get(row.boss) ?? { damage: 0, attacks: 0 };
    current.damage += toNumber(row.total_damage);
    current.attacks += 1;
    result.set(row.boss, current);
  }
  return result;
}

export function aggregateNikkeUsageRows(
  rows: ReadonlyArray<{
    nikke: string;
    picks: number | string;
    avg_damage: number | string;
  }>,
) {
  const result = new Map<string, { picks: number; weightedDamage: number }>();
  for (const row of rows) {
    const picks = toNumber(row.picks);
    const current = result.get(row.nikke) ?? { picks: 0, weightedDamage: 0 };
    current.picks += picks;
    current.weightedDamage += toNumber(row.avg_damage) * picks;
    result.set(row.nikke, current);
  }
  return [...result.entries()].map(([name, value]) => ({
    name,
    picks: value.picks,
    avgDamage: value.picks === 0 ? 0 : Math.round(value.weightedDamage / value.picks),
  }));
}

function makePeriod(season: number, day: number, isLatest: boolean): RaidPeriod {
  return {
    season,
    day,
    difficulty: day === 1 ? "normal" : "hard",
    label: `${season}차 · Day ${day}`,
    isLatest,
  };
}

function selectPeriod(
  query: DashboardQuery,
  availablePeriods: readonly RaidPeriod[],
): RaidPeriod {
  const latest = availablePeriods[0];
  if (!latest) {
    return makePeriod(query.season ?? 0, query.day ?? 1, true);
  }

  const season = query.season ?? latest.season;
  const latestDayForSeason = availablePeriods.find(
    (period) => period.season === season,
  )?.day;
  const day = query.day ?? latestDayForSeason;
  const selected = availablePeriods.find(
    (period) => period.season === season && period.day === day,
  );

  if (!selected) {
    throw new RangeError(`존재하지 않는 레이드 기간입니다: ${season}차 Day ${day}`);
  }
  return selected;
}

export async function getSupabaseGuildSummary(
  client: Client,
  areaId: AreaId,
  guildId: string,
): Promise<GuildSummary | null> {
  const result = await client
    .from("guilds")
    .select("area_id, guild_id, name, member_count, roster_state, sync_state, last_synced")
    .eq("area_id", areaId)
    .eq("guild_id", guildId)
    .maybeSingle();
  if (result.error) {
    throw new SupabaseReadError("guilds", result.error.message);
  }

  const row = result.data;
  if (!row) return null;
  return {
    areaId,
    guildId: row.guild_id,
    name: row.name?.trim() || `유니온 ${row.guild_id}`,
    memberCount: row.member_count ?? 0,
    rosterState: asRosterState(row.roster_state),
    syncState: asSyncState(row.sync_state),
    lastSyncedAt: row.last_synced,
  };
}

export async function getSupabaseAvailablePeriods(
  client: Client,
  areaId: AreaId,
  guildId: string,
): Promise<RaidPeriod[]> {
  const result = await client
    .from("v_member_daily")
    .select("season, day")
    .eq("area_id", areaId)
    .eq("guild_id", guildId)
    .order("season", { ascending: false })
    .order("day", { ascending: false });
  const rows = requireData(result, "v_member_daily 기간");
  const seen = new Set<string>();
  const pairs: Array<{ season: number; day: number }> = [];

  for (const row of rows) {
    const key = `${row.season}:${row.day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ season: row.season, day: row.day });
  }

  return pairs.map(({ season, day }, index) => makePeriod(season, day, index === 0));
}

function emptyModel(
  guild: GuildSummary,
  selectedPeriod: RaidPeriod,
  periods: RaidPeriod[],
): DashboardModel {
  const totalTickets = guild.memberCount * 3;
  return {
    source: "supabase",
    status: dashboardStatus(guild.syncState),
    guild,
    selectedPeriod,
    periods,
    overview: {
      totalDamage: 0,
      totalTickets,
      usedTickets: 0,
      remainingTickets: totalTickets,
      participants: 0,
      totalMembers: guild.memberCount,
      finalHits: 0,
      ranking: [],
      participation: [],
      bosses: [],
    },
    combos: { bosses: [], rows: [], usage: [] },
    trend: { seasons: [], growth: [] },
  };
}

export async function getSupabaseDashboardModel(
  client: Client,
  query: DashboardQuery,
): Promise<DashboardModel | null> {
  const guild = await getSupabaseGuildSummary(
    client,
    query.areaId,
    query.guildId,
  );
  if (!guild) return null;

  const periods = await getSupabaseAvailablePeriods(
    client,
    query.areaId,
    query.guildId,
  );
  const selectedPeriod = selectPeriod(query, periods);
  if (periods.length === 0) return emptyModel(guild, selectedPeriod, periods);

  const difficulty = selectedPeriod.day === 1 ? 1 : 2;
  const [
    memberDailyResult,
    participationResult,
    seasonBossesResult,
    bossLevelsResult,
    bossAttacksResult,
    comboResult,
    usageResult,
    seasonTotalsResult,
    growthResult,
    nikkesResult,
  ] = await Promise.all([
    client
      .from("v_member_daily")
      .select("*")
      .eq("area_id", query.areaId)
      .eq("guild_id", query.guildId)
      .eq("season", selectedPeriod.season)
      .eq("day", selectedPeriod.day),
    client
      .from("v_participation")
      .select("*")
      .eq("area_id", query.areaId)
      .eq("guild_id", query.guildId)
      .eq("season", selectedPeriod.season)
      .eq("day", selectedPeriod.day),
    client
      .from("season_bosses")
      .select("*")
      .eq("season", selectedPeriod.season)
      .order("step", { ascending: true }),
    client
      .from("boss_levels")
      .select("*")
      .eq("area_id", query.areaId)
      .eq("guild_id", query.guildId)
      .eq("season", selectedPeriod.season)
      .eq("difficulty", difficulty)
      .order("level", { ascending: false }),
    client
      .from("attacks")
      .select("boss, total_damage")
      .eq("area_id", query.areaId)
      .eq("guild_id", query.guildId)
      .eq("season", selectedPeriod.season)
      .eq("day", selectedPeriod.day),
    client
      .from("v_combo_stats")
      .select("*")
      .eq("area_id", query.areaId)
      .eq("guild_id", query.guildId)
      .eq("season", selectedPeriod.season)
      .eq("difficulty", difficulty),
    client
      .from("v_nikke_usage")
      .select("*")
      .eq("area_id", query.areaId)
      .eq("guild_id", query.guildId)
      .eq("season", selectedPeriod.season)
      .eq("day", selectedPeriod.day)
      .eq("difficulty", difficulty),
    client
      .from("v_season_totals")
      .select("*")
      .eq("area_id", query.areaId)
      .eq("guild_id", query.guildId)
      .order("season", { ascending: true }),
    client
      .from("v_member_growth")
      .select("*")
      .eq("area_id", query.areaId)
      .eq("guild_id", query.guildId)
      .eq("season", selectedPeriod.season),
    client.from("nikkes").select("name, img_code"),
  ]);

  const memberRows = requireData(memberDailyResult, "v_member_daily");
  const participationRows = requireData(participationResult, "v_participation");
  const seasonBossRows = requireData(seasonBossesResult, "season_bosses");
  const bossLevelRows = requireData(bossLevelsResult, "boss_levels");
  const bossAttackRows = requireData(bossAttacksResult, "attacks 보스 집계");
  const comboRows = requireData(comboResult, "v_combo_stats");
  const usageRows = requireData(usageResult, "v_nikke_usage");
  const seasonTotalRows = requireData(seasonTotalsResult, "v_season_totals");
  const growthRows = requireData(growthResult, "v_member_growth");
  const nikkeRows = requireData(nikkesResult, "nikkes");

  const displayNames = new Map(
    participationRows.map((row) => [row.openid, row.display_name]),
  );
  const ranking: MemberRanking[] = memberRows
    .map((row) => ({
      rank: 0,
      openid: row.openid,
      displayName:
        displayNames.get(row.openid) ?? row.nickname ?? "이름 없음",
      damage: toNumber(row.damage),
      tries: toNumber(row.tries),
      bestHit: toNumber(row.best_hit),
      syncLevel: row.sync_lv,
      finalHits: toNumber(row.final_hits),
      contributionPct: toNumber(row.contribution_pct),
    }))
    .sort((a, b) => b.damage - a.damage)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const participation: ParticipationMember[] = participationRows
    .map((row) => {
      const tries = toNumber(row.tries);
      return {
        openid: row.openid,
        displayName: row.display_name,
        nickname: row.nickname,
        tries,
        remaining: toNumber(row.remaining),
        damage: toNumber(row.damage),
        status:
          tries === 0
            ? ("unused" as const)
            : tries < 3
              ? ("partial" as const)
              : ("complete" as const),
      };
    })
    .sort(
      (a, b) =>
        b.remaining - a.remaining || a.displayName.localeCompare(b.displayName),
    );

  const combos: ComboRanking[] = comboRows
    .map((row) => ({
      rank: 0,
      boss: row.boss,
      difficulty: difficulty === 1 ? ("normal" as const) : ("hard" as const),
      nikkeNames: row.combo,
      uses: toNumber(row.n),
      avgDamage: toNumber(row.avg_damage),
      maxDamage: toNumber(row.max_damage),
      minDamage: toNumber(row.min_damage),
      avgSyncLevel: row.avg_sync_lv,
    }))
    .sort((a, b) => b.avgDamage - a.avgDamage)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const levelByBoss = new Map<string, (typeof bossLevelRows)[number]>();
  for (const level of bossLevelRows) {
    if (!levelByBoss.has(level.boss)) levelByBoss.set(level.boss, level);
  }
  const attacksByBoss = aggregateBossAttacks(bossAttackRows);

  const bosses: BossProgress[] = seasonBossRows.map((row) => {
    const level = levelByBoss.get(row.name);
    const bossAttacks = attacksByBoss.get(row.name);
    const damage = bossAttacks?.damage ?? 0;
    const maxHp = level?.max_hp ?? row.hp?.[0] ?? null;
    // 누적 공격 딜은 여러 레벨에 걸칠 수 있으므로 현재 HP를 역산하지 않는다.
    const currentHp = level?.current_hp ?? null;
    const progressPct =
      maxHp === null || currentHp === null || maxHp === 0
        ? null
        : Math.min(100, ((maxHp - currentHp) / maxHp) * 100);

    return {
      step: row.step,
      name: row.name,
      weak: row.weak ?? "미확인",
      image: row.img ? assetUrl(`boss/${row.img}`) : null,
      difficulty: difficulty === 1 ? "normal" : "hard",
      level: level?.level ?? 1,
      maxHp,
      currentHp,
      damage,
      attacks: bossAttacks?.attacks ?? 0,
      defeated: currentHp === 0 && maxHp !== null,
      progressPct,
    };
  });

  const imagesByNikke = new Map(
    nikkeRows.map((row) => [
      row.name,
      row.img_code ? assetUrl(`nikke/si_${row.img_code}_00_s.png`) : null,
    ]),
  );
  const usage: NikkeUsage[] = aggregateNikkeUsageRows(usageRows)
    .map((row) => ({
      ...row,
      image: imagesByNikke.get(row.name) ?? null,
    }))
    .sort((a, b) => b.picks - a.picks || b.avgDamage - a.avgDamage);

  let previousSeasonDamage: number | null = null;
  const seasons: SeasonTrend[] = seasonTotalRows.map((row) => {
    const damage = toNumber(row.damage);
    const trend = {
      season: row.season,
      damage,
      attacks: toNumber(row.attacks),
      participants: toNumber(row.participants),
      bosses: toNumber(row.bosses),
      changePct: percentChange(damage, previousSeasonDamage),
    };
    previousSeasonDamage = damage;
    return trend;
  });

  const growth: MemberGrowth[] = growthRows
    .map((row) => {
      const damage = toNumber(row.damage);
      const previousDamage =
        row.prev_damage === null ? null : toNumber(row.prev_damage);
      return {
        openid: row.openid,
        displayName:
          displayNames.get(row.openid) ?? row.nickname ?? "이름 없음",
        season: row.season,
        damage,
        previousDamage,
        changePct: percentChange(damage, previousDamage),
        syncLevel: row.sync_lv,
      };
    })
    .sort((a, b) => b.damage - a.damage);

  const usedTickets = participation.length
    ? participation.reduce((total, row) => total + row.tries, 0)
    : ranking.reduce((total, row) => total + row.tries, 0);
  const totalMembers = Math.max(participation.length, guild.memberCount);
  const totalTickets = totalMembers * 3;

  return {
    source: "supabase",
    status: dashboardStatus(guild.syncState),
    guild: { ...guild, memberCount: totalMembers },
    selectedPeriod,
    periods,
    overview: {
      totalDamage: ranking.reduce((total, row) => total + row.damage, 0),
      totalTickets,
      usedTickets,
      remainingTickets: Math.max(0, totalTickets - usedTickets),
      participants: ranking.length,
      totalMembers,
      finalHits: ranking.reduce((total, row) => total + row.finalHits, 0),
      ranking,
      participation,
      bosses,
    },
    combos: {
      bosses: bosses.map((row) => row.name),
      rows: combos,
      usage,
    },
    trend: { seasons, growth },
  };
}
