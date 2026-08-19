import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { CollectionDatabase } from "./collect-service.ts";
import type {
  ApplyCollectionResult,
  AreaId,
  ClaimedJob,
  CollectionPayload,
  FailSyncResult,
  RequestedSync,
  RosterState,
  SyncTrigger,
} from "./contracts.ts";
import { isRecord, isUuid, parseAreaId, parseGuildId } from "./contracts.ts";
import { configurationError, databaseError } from "./errors.ts";
import type { NikkeNameMap } from "./normalize.ts";
import { requiredEnvironment } from "./runtime.ts";

const SYNC_STATES = new Set([
  "pending",
  "syncing",
  "ok",
  "auth_required",
  "dead",
]);
const ROSTER_STATES = new Set(["complete", "limited", "unknown"]);

export class SyncDatabase implements CollectionDatabase {
  readonly #client: SupabaseClient;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.#client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "x-application-name": "nikkeuraid-collector" } },
    });
  }

  async registerOrTouchGuild(
    areaId: AreaId,
    guildId: string,
  ): Promise<RequestedSync> {
    const row = await this.#singleRpc("register_or_touch_guild", {
      p_area_id: areaId,
      p_guild_id: guildId,
    });
    return {
      area_id: requireAreaId(row.area_id, "register_or_touch_guild"),
      guild_id: requireGuildId(row.guild_id, "register_or_touch_guild"),
      sync_state: requireSyncState(row.sync_state, "register_or_touch_guild"),
      roster_state: requireRosterState(
        row.roster_state,
        "register_or_touch_guild",
      ),
      created: requireBoolean(row.created, "register_or_touch_guild"),
      should_collect: requireBoolean(
        row.should_collect,
        "register_or_touch_guild",
      ),
      rate_limited: requireBoolean(row.rate_limited, "register_or_touch_guild"),
      last_requested: optionalString(
        row.last_requested,
        "register_or_touch_guild",
      ),
      last_synced: optionalString(row.last_synced, "register_or_touch_guild"),
      last_error_code: optionalString(
        row.last_error_code,
        "register_or_touch_guild",
      ),
    };
  }

  async nextSyncBatch(limit: number): Promise<ClaimedJob[]> {
    const { data, error } = await this.#client.rpc("next_sync_batch", {
      p_limit: limit,
    });
    if (error || !Array.isArray(data)) {
      throw this.#operationError("next_sync_batch");
    }
    return data.map((value) => {
      if (!isRecord(value)) throw this.#operationError("next_sync_batch");
      return {
        area_id: requireAreaId(value.area_id, "next_sync_batch"),
        guild_id: requireGuildId(value.guild_id, "next_sync_batch"),
      };
    });
  }

  async claimGuildSync(
    areaId: AreaId,
    guildId: string,
    claimToken: string,
    trigger: SyncTrigger = "cron",
  ): Promise<boolean> {
    if (!isUuid(claimToken)) throw this.#operationError("claim_guild_sync");
    const row = await this.#singleRpc("claim_guild_sync", {
      p_area_id: areaId,
      p_guild_id: guildId,
      p_token: claimToken,
      p_trigger: trigger,
      p_lease_seconds: 120,
    });
    return requireBoolean(row.claimed, "claim_guild_sync");
  }

  async getNikkeNames(): Promise<NikkeNameMap> {
    const { data, error } = await this.#client
      .from("nikkes")
      .select("tid_prefix,name")
      .order("tid_prefix", { ascending: true });
    if (error || !Array.isArray(data)) {
      throw this.#operationError("get_nikke_names");
    }
    const names = new Map<number, string>();
    for (const value of data as unknown[]) {
      if (
        !isRecord(value) || !Number.isInteger(value.tid_prefix) ||
        typeof value.name !== "string"
      ) {
        throw this.#operationError("get_nikke_names");
      }
      names.set(value.tid_prefix as number, value.name);
    }
    if (names.size === 0) throw this.#operationError("get_nikke_names");
    return names;
  }

  async getLatestConfiguredSeason(): Promise<number> {
    const { data, error } = await this.#client
      .from("season_bosses")
      .select("season")
      .order("season", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      error || !isRecord(data) || !Number.isInteger(data.season) ||
      (data.season as number) < 1
    ) {
      throw this.#operationError("get_latest_configured_season");
    }
    return data.season as number;
  }

  async getKnownSeasons(
    areaId: AreaId,
    guildId: string,
  ): Promise<ReadonlySet<number>> {
    const { data, error } = await this.#client
      .from("v_season_totals")
      .select("season")
      .eq("area_id", areaId)
      .eq("guild_id", guildId);
    if (error || !Array.isArray(data)) {
      throw this.#operationError("get_known_seasons");
    }
    const seasons = new Set<number>();
    for (const value of data as unknown[]) {
      if (!isRecord(value) || !Number.isInteger(value.season)) {
        throw this.#operationError("get_known_seasons");
      }
      seasons.add(value.season as number);
    }
    return seasons;
  }

  async applyCollection(
    claimToken: string,
    payload: CollectionPayload,
  ): Promise<ApplyCollectionResult> {
    const row = await this.#singleRpc("apply_collection", {
      p_payload: payload,
      p_token: claimToken,
    });
    return {
      applied: requireBoolean(row.applied, "apply_collection"),
      reason: requireString(row.reason, "apply_collection"),
      sync_state: requireSyncState(row.sync_state, "apply_collection"),
      inserted: requireInteger(row.inserted, "apply_collection", 0),
      live_replaced: requireBoolean(row.live_replaced, "apply_collection"),
      roster_state: requireRosterState(row.roster_state, "apply_collection"),
    };
  }

  async failGuildSync(options: {
    areaId: AreaId;
    guildId: string;
    claimToken: string;
    errorCode: string;
    safeNote: string;
    durationMs: number;
    authRequired: boolean;
  }): Promise<FailSyncResult> {
    const row = await this.#singleRpc("fail_guild_sync", {
      p_area_id: options.areaId,
      p_guild_id: options.guildId,
      p_token: options.claimToken,
      p_error_code: options.errorCode,
      p_safe_note: options.safeNote,
      p_duration_ms: options.durationMs,
      p_auth_required: options.authRequired,
    });
    return {
      applied: requireBoolean(row.applied, "fail_guild_sync"),
      sync_state: requireSyncState(row.sync_state, "fail_guild_sync"),
      fail_count: requireInteger(row.fail_count, "fail_guild_sync", 0),
    };
  }

  async #singleRpc(
    name: string,
    parameters: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await this.#client.rpc(name, parameters)
      .maybeSingle();
    if (error || !isRecord(data)) throw this.#operationError(name);
    return data;
  }

  #operationError(operation: string): Error {
    console.error(
      JSON.stringify({ event: "database_operation_failed", operation }),
    );
    return databaseError(operation);
  }
}

export function createSyncDatabase(): SyncDatabase {
  const url = requiredEnvironment("SUPABASE_URL");
  const key = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  try {
    return new SyncDatabase(url, key);
  } catch {
    throw configurationError("SUPABASE_URL");
  }
}

function requireAreaId(value: unknown, operation: string): AreaId {
  try {
    return parseAreaId(value);
  } catch {
    throw databaseError(operation);
  }
}

function requireGuildId(value: unknown, operation: string): string {
  try {
    return parseGuildId(value);
  } catch {
    throw databaseError(operation);
  }
}

function requireBoolean(value: unknown, operation: string): boolean {
  if (typeof value !== "boolean") throw databaseError(operation);
  return value;
}

function requireString(value: unknown, operation: string): string {
  if (typeof value !== "string") throw databaseError(operation);
  return value;
}

function optionalString(value: unknown, operation: string): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value, operation);
}

function requireInteger(
  value: unknown,
  operation: string,
  minimum: number,
): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw databaseError(operation);
  }
  return value as number;
}

function requireSyncState(
  value: unknown,
  operation: string,
): RequestedSync["sync_state"] {
  if (typeof value !== "string" || !SYNC_STATES.has(value)) {
    throw databaseError(operation);
  }
  return value as RequestedSync["sync_state"];
}

function requireRosterState(value: unknown, operation: string): RosterState {
  if (typeof value !== "string" || !ROSTER_STATES.has(value)) {
    throw databaseError(operation);
  }
  return value as RosterState;
}
