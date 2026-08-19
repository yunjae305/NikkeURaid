import type { BlablaApi } from "./api-client.ts";
import type {
  ApplyCollectionResult,
  AreaId,
  CollectionPayload,
  FailSyncResult,
  NormalizedAttack,
} from "./contracts.ts";
import type { NikkeNameMap } from "./normalize.ts";
import { AppError, safeFailureNote, toAppError } from "./errors.ts";
import {
  normalizeCurrentSeason,
  normalizeGuildMembers,
  normalizeRaidAttacks,
} from "./normalize.ts";

export interface CollectionDatabase {
  claimGuildSync(
    areaId: AreaId,
    guildId: string,
    claimToken: string,
  ): Promise<boolean>;
  getNikkeNames(): Promise<NikkeNameMap>;
  getLatestConfiguredSeason(): Promise<number>;
  getKnownSeasons(
    areaId: AreaId,
    guildId: string,
  ): Promise<ReadonlySet<number>>;
  applyCollection(
    claimToken: string,
    payload: CollectionPayload,
  ): Promise<ApplyCollectionResult>;
  failGuildSync(options: {
    areaId: AreaId;
    guildId: string;
    claimToken: string;
    errorCode: string;
    safeNote: string;
    durationMs: number;
    authRequired: boolean;
  }): Promise<FailSyncResult>;
}

export interface CollectionTarget {
  areaId: AreaId;
  guildId: string;
  claimToken: string;
}

export interface CollectionResult {
  applied: boolean;
  currentSeason: number;
  liveAttackCount: number;
  settledAttackCount: number;
  rosterState: "complete" | "limited";
  memberCount: number | null;
  durationMs: number;
}

interface CollectionOptions {
  database: CollectionDatabase;
  api: BlablaApi;
  target: CollectionTarget;
  now?: () => number;
  minimumHistorySeason?: number;
  maximumHistoryRequests?: number;
  emptyHistoryStop?: number;
  alreadyClaimed?: boolean;
}

export async function collectGuild(
  options: CollectionOptions,
): Promise<CollectionResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const claimed = options.alreadyClaimed ||
    await options.database.claimGuildSync(
      options.target.areaId,
      options.target.guildId,
      options.target.claimToken,
    );
  if (!claimed) {
    throw new AppError({
      code: "sync_not_claimed",
      message:
        "This guild is already being collected or is not currently eligible",
      httpStatus: 409,
      retryable: true,
    });
  }

  try {
    const names = await options.database.getNikkeNames();
    const intlOpenId = await options.api.getIntlOpenId();
    const levelInfo = await options.api.getRaidLevelInfo(
      options.target.areaId,
      options.target.guildId,
      intlOpenId,
    );
    const activeSeason = normalizeCurrentSeason(levelInfo);
    const seasonAnchor = activeSeason ??
      await options.database.getLatestConfiguredSeason();
    let liveAttacks: NormalizedAttack[] = [];
    if (activeSeason !== null) {
      const currentPayload = await options.api.getCurrentRaid(
        options.target.areaId,
        options.target.guildId,
        intlOpenId,
      );
      liveAttacks = normalizeRaidAttacks(currentPayload, activeSeason, names);
    }

    let rosterState: "complete" | "limited" = "complete";
    let members = [] as ReturnType<typeof normalizeGuildMembers>;
    try {
      const membersPayload = await options.api.getGuildMembers(
        options.target.areaId,
        options.target.guildId,
      );
      members = normalizeGuildMembers(
        membersPayload,
        options.target.areaId,
        options.target.guildId,
      );
    } catch (error) {
      const appError = toAppError(error);
      if (appError.code !== "upstream_permission_denied") throw appError;
      rosterState = "limited";
    }

    const history = await collectMissingHistory({
      database: options.database,
      api: options.api,
      names,
      areaId: options.target.areaId,
      guildId: options.target.guildId,
      firstSeason: activeSeason === null ? seasonAnchor : activeSeason - 1,
      minimumSeason: options.minimumHistorySeason ?? 35,
      maximumRequests: options.maximumHistoryRequests ?? 9,
      emptyStop: options.emptyHistoryStop ?? 3,
    });
    const settledAttacks = history.attacks;
    if (
      liveAttacks.length === 0 &&
      settledAttacks.length === 0 &&
      history.permissionDenied
    ) {
      throw new AppError({
        code: "upstream_permission_denied",
        message: "BlablaLink denied access to this guild",
        httpStatus: 403,
        retryable: false,
        safeContext: "guild_collection",
      });
    }
    const durationMs = Math.max(0, Math.round(now() - startedAt));
    const payload: CollectionPayload = {
      area_id: options.target.areaId,
      guild_id: options.target.guildId,
      duration_ms: durationMs,
      guild: {
        name: null,
        member_count: rosterState === "complete" ? members.length : null,
      },
      roster: { state: rosterState, members },
      settled_attacks: settledAttacks,
      live: activeSeason === null
        ? null
        : { season: activeSeason, attacks: liveAttacks },
      boss_levels: [],
    };
    const completion = await options.database.applyCollection(
      options.target.claimToken,
      payload,
    );
    return {
      applied: completion.applied,
      currentSeason: seasonAnchor,
      liveAttackCount: liveAttacks.length,
      settledAttackCount: settledAttacks.length,
      rosterState,
      memberCount: rosterState === "complete" ? members.length : null,
      durationMs,
    };
  } catch (error) {
    const appError = toAppError(error);
    const durationMs = Math.max(0, Math.round(now() - startedAt));
    try {
      await options.database.failGuildSync({
        areaId: options.target.areaId,
        guildId: options.target.guildId,
        claimToken: options.target.claimToken,
        errorCode: appError.code,
        safeNote: safeFailureNote(appError),
        durationMs,
        authRequired: appError.authRequired,
      });
    } catch {
      // The original categorized error is safer and more useful to the caller;
      // database implementations separately emit only a sanitized operation log.
    }
    throw appError;
  }
}

async function collectMissingHistory(options: {
  database: CollectionDatabase;
  api: BlablaApi;
  names: NikkeNameMap;
  areaId: AreaId;
  guildId: string;
  firstSeason: number;
  minimumSeason: number;
  maximumRequests: number;
  emptyStop: number;
}): Promise<{ attacks: NormalizedAttack[]; permissionDenied: boolean }> {
  const known = await options.database.getKnownSeasons(
    options.areaId,
    options.guildId,
  );
  const collected: NormalizedAttack[] = [];
  let requests = 0;
  let consecutiveEmpty = 0;
  let permissionDenied = false;

  for (
    let season = options.firstSeason;
    season >= options.minimumSeason;
    season -= 1
  ) {
    // The newest settled season may previously have been stored as a partial
    // live snapshot. Re-fetch it once so final late rows are never stranded.
    if (known.has(season) && season !== options.firstSeason) continue;
    if (
      requests >= options.maximumRequests ||
      consecutiveEmpty >= options.emptyStop
    ) break;
    requests += 1;
    let payload: unknown;
    try {
      payload = await options.api.getSettledRaid(
        options.areaId,
        options.guildId,
        season,
      );
    } catch (error) {
      const appError = toAppError(error);
      // A verified permission denial means this account cannot backfill this
      // guild. Preserve already collected data and continue with live results.
      if (appError.code === "upstream_permission_denied") {
        permissionDenied = true;
        break;
      }
      throw appError;
    }
    const attacks = normalizeRaidAttacks(payload, season, options.names);
    if (attacks.length === 0) {
      consecutiveEmpty += 1;
      continue;
    }
    consecutiveEmpty = 0;
    collected.push(...attacks);
  }

  return { attacks: collected, permissionDenied };
}
