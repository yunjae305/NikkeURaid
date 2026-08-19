import type { BlablaApi } from "./api-client.ts";
import { collectGuild, type CollectionDatabase } from "./collect-service.ts";
import type { CollectionPayload } from "./contracts.ts";
import { AppError } from "./errors.ts";
import { assert, assertEquals, assertRejects, test } from "./test-utils.ts";

function raidAttack(): Record<string, unknown> {
  return {
    boss_id: "boss",
    day: 1,
    difficulty: 2,
    element_id: ["Wind"],
    icon_id: "icon",
    is_final_hit: false,
    level: 4,
    monster_model_id: "monster",
    name_localvalues: { ko: "보스 [X]" },
    nickname: "길드원",
    openid: "member-1",
    squad: [{ combat: 100, lv: 300, slot: 1, tid: 25_301 }],
    step: 1,
    total_damage: "123456789012345",
  };
}

function memberPayload(): unknown {
  return {
    code: 0,
    data: {
      guild_id: "28517",
      nikke_area_id: 83,
      items: [{
        bind_area_id: 83,
        icon_id: "1",
        level: 400,
        member_id: "member-1",
        nickname: "길드원",
        synchro_level: 300,
      }],
    },
  };
}

function permissionError(endpoint: string): AppError {
  return new AppError({
    code: "upstream_permission_denied",
    message: "denied",
    httpStatus: 403,
    safeContext: endpoint,
  });
}

function setup(overrides: {
  members?: () => Promise<unknown>;
  settled?: (season: number) => Promise<unknown>;
  knownSeasons?: ReadonlySet<number>;
} = {}): {
  database: CollectionDatabase;
  api: BlablaApi;
  applied: CollectionPayload[];
  failures: string[];
  historyRequests: number[];
} {
  const applied: CollectionPayload[] = [];
  const failures: string[] = [];
  const historyRequests: number[] = [];
  const database: CollectionDatabase = {
    claimGuildSync: async () => true,
    getNikkeNames: async () => new Map([[253, "크라운"]]),
    getLatestConfiguredSeason: async () => 43,
    getKnownSeasons: async () => overrides.knownSeasons ?? new Set<number>(),
    applyCollection: async (_token, payload) => {
      applied.push(payload);
      return {
        applied: true,
        reason: "applied",
        sync_state: "ok",
        inserted: payload.settled_attacks.length,
        live_replaced: false,
        roster_state: payload.roster.state,
      };
    },
    failGuildSync: async ({ errorCode }) => {
      failures.push(errorCode);
      return { applied: true, sync_state: "pending", fail_count: 1 };
    },
  };
  const api: BlablaApi = {
    getIntlOpenId: async () => "own-open-id",
    getRaidLevelInfo: async () => ({
      code: 0,
      data: { level_info: [], manager_info: { id: "0" } },
    }),
    getCurrentRaid: async () => {
      throw new Error(
        "current endpoint must not be called without an active season",
      );
    },
    getGuildMembers: overrides.members ?? (async () => memberPayload()),
    getSettledRaid: async (_areaId, _guildId, season) => {
      historyRequests.push(season);
      if (overrides.settled) return overrides.settled(season);
      return {
        code: 0,
        data: {
          manager_info: { id: String(season) },
          participate_data: season === 42 ? [raidAttack()] : [],
        },
      };
    },
  };
  return { database, api, applied, failures, historyRequests };
}

test("falls back to configured season 43 and collects settled season 42 when no raid is active", async () => {
  const context = setup();
  const result = await collectGuild({
    database: context.database,
    api: context.api,
    target: {
      areaId: 83,
      guildId: "28517",
      claimToken: "7aa31c35-71b6-4c89-a785-5ece79d08f91",
    },
    now: () => 100,
  });
  assertEquals(context.historyRequests, [43, 42, 41, 40, 39]);
  assertEquals(result.currentSeason, 43);
  assertEquals(result.settledAttackCount, 1);
  assertEquals(context.applied[0].live, null);
  assertEquals(context.applied[0].settled_attacks[0].season, 42);
  assertEquals(context.applied[0].roster.members[0].openid, "member-1");
  assertEquals(context.failures, []);
});

test("fails a completely inaccessible foreign guild instead of applying an empty ok snapshot", async () => {
  const context = setup({
    members: async () => {
      throw permissionError("guild_members");
    },
    settled: async () => {
      throw permissionError("settled_raid");
    },
  });
  await assertRejects(
    () =>
      collectGuild({
        database: context.database,
        api: context.api,
        target: {
          areaId: 83,
          guildId: "99999",
          claimToken: "7aa31c35-71b6-4c89-a785-5ece79d08f91",
        },
      }),
    (error) =>
      error instanceof AppError && error.code === "upstream_permission_denied",
  );
  assertEquals(context.applied.length, 0);
  assertEquals(context.failures, ["upstream_permission_denied"]);
});

test("does not call an empty roster-only result successful when raid history is denied", async () => {
  const context = setup({
    settled: async () => {
      throw permissionError("settled_raid");
    },
  });
  await assertRejects(
    () =>
      collectGuild({
        database: context.database,
        api: context.api,
        target: {
          areaId: 83,
          guildId: "28517",
          claimToken: "7aa31c35-71b6-4c89-a785-5ece79d08f91",
        },
      }),
    (error) =>
      error instanceof AppError && error.code === "upstream_permission_denied",
  );
  assertEquals(context.applied.length, 0);
});

test("allows limited roster mode when raid records are available", async () => {
  const context = setup({
    members: async () => {
      throw permissionError("guild_members");
    },
  });
  const result = await collectGuild({
    database: context.database,
    api: context.api,
    target: {
      areaId: 83,
      guildId: "28517",
      claimToken: "7aa31c35-71b6-4c89-a785-5ece79d08f91",
    },
  });
  assertEquals(result.rosterState, "limited");
  assert(context.applied[0].settled_attacks.length > 0);
  assertEquals(context.applied[0].guild.member_count, null);
});

test("sweeps every configured season from 43 through 35 when each has records", async () => {
  const context = setup({
    settled: async (season) => ({
      code: 0,
      data: {
        manager_info: { id: String(season) },
        participate_data: [raidAttack()],
      },
    }),
  });
  const result = await collectGuild({
    database: context.database,
    api: context.api,
    target: {
      areaId: 83,
      guildId: "28517",
      claimToken: "7aa31c35-71b6-4c89-a785-5ece79d08f91",
    },
  });
  assertEquals(context.historyRequests, [43, 42, 41, 40, 39, 38, 37, 36, 35]);
  assertEquals(result.settledAttackCount, 9);
});

test("never rewrites canonical member_id from a matching historical nickname", async () => {
  const context = setup({
    members: async () => ({
      code: 0,
      data: {
        guild_id: "28517",
        nikke_area_id: 83,
        items: [{
          bind_area_id: 83,
          icon_id: "1",
          level: 400,
          member_id: "new-member-id",
          nickname: "길드원",
          synchro_level: 300,
        }],
      },
    }),
  });
  await collectGuild({
    database: context.database,
    api: context.api,
    target: {
      areaId: 83,
      guildId: "28517",
      claimToken: "7aa31c35-71b6-4c89-a785-5ece79d08f91",
    },
  });
  assertEquals(context.applied[0].roster.members[0].openid, "new-member-id");
});

test("re-fetches the newest settled season even when a partial snapshot is known", async () => {
  const context = setup({
    knownSeasons: new Set([43, 42, 41, 40, 39, 38, 37, 36, 35]),
    settled: async (season) => ({
      code: 0,
      data: {
        manager_info: { id: String(season) },
        participate_data: [raidAttack(), raidAttack()],
      },
    }),
  });
  const result = await collectGuild({
    database: context.database,
    api: context.api,
    target: {
      areaId: 83,
      guildId: "28517",
      claimToken: "7aa31c35-71b6-4c89-a785-5ece79d08f91",
    },
  });
  assertEquals(context.historyRequests, [43]);
  assertEquals(result.settledAttackCount, 2);
  assertEquals(
    context.applied[0].settled_attacks.map((item) => item.source_index),
    [0, 1],
  );
});
