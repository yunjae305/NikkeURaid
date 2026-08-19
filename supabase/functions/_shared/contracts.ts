export const SUPPORTED_AREA_IDS = [81, 82, 83, 84, 85] as const;

export type AreaId = (typeof SUPPORTED_AREA_IDS)[number];
export type RosterState = "complete" | "limited" | "unknown";

export interface SyncRequest {
  area_id: AreaId;
  guild_id: string;
}

export interface CollectRequest extends SyncRequest {
  claim_token: string;
}

export type SyncTrigger = "on_demand" | "cron";

export interface DispatchRequest {
  limit: number;
}

export interface NormalizedSquadMember {
  slot: number;
  tid: number;
  lv: number;
  name: string;
  grade: string;
  break: string;
  combat: number;
}

export interface NormalizedAttack {
  season: number;
  source_index: number;
  day: 1 | 2;
  step: number;
  difficulty: 1 | 2;
  level: number;
  boss: string;
  element: string | null;
  openid: string;
  nickname: string;
  sync_lv: number | null;
  total_damage: string;
  is_final_hit: boolean;
  squad: NormalizedSquadMember[];
  boss_id: string | null;
  icon_id: string | null;
}

export interface NormalizedMember {
  openid: string;
  nickname: string;
  sync_lv: number | null;
  commander_level: number | null;
  icon_id: string | null;
}

export interface CollectionPayload {
  area_id: AreaId;
  guild_id: string;
  duration_ms: number;
  guild: {
    name: string | null;
    member_count: number | null;
  };
  roster: {
    state: RosterState;
    members: NormalizedMember[];
  };
  settled_attacks: NormalizedAttack[];
  live: {
    season: number;
    attacks: NormalizedAttack[];
  } | null;
  // The current public response evidence only confirms manager_info.id. Keep
  // this empty until the boss-level record shape is verified rather than
  // guessing fields that could corrupt HP history.
  boss_levels: [];
}

export interface RequestedSync {
  area_id: AreaId;
  guild_id: string;
  sync_state: "pending" | "syncing" | "ok" | "auth_required" | "dead";
  roster_state: RosterState;
  created: boolean;
  should_collect: boolean;
  rate_limited: boolean;
  last_requested: string | null;
  last_synced: string | null;
  last_error_code: string | null;
}

export interface ClaimedJob {
  area_id: AreaId;
  guild_id: string;
}

export interface ApplyCollectionResult {
  applied: boolean;
  reason: string;
  sync_state: "pending" | "syncing" | "ok" | "auth_required" | "dead";
  inserted: number;
  live_replaced: boolean;
  roster_state: RosterState;
}

export interface FailSyncResult {
  applied: boolean;
  sync_state: "pending" | "syncing" | "ok" | "auth_required" | "dead";
  fail_count: number;
}

const GUILD_ID_PATTERN = /^\d{1,20}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSyncRequest(value: unknown): SyncRequest {
  const record = requireRequestRecord(value);
  assertOnlyKeys(record, ["area_id", "guild_id"]);
  return {
    area_id: parseAreaId(record.area_id),
    guild_id: parseGuildId(record.guild_id),
  };
}

export function parseCollectRequest(value: unknown): CollectRequest {
  const record = requireRequestRecord(value);
  assertOnlyKeys(record, ["area_id", "guild_id", "claim_token"]);
  const token = record.claim_token;
  if (typeof token !== "string" || !UUID_PATTERN.test(token)) {
    throw new TypeError("claim_token must be a UUID");
  }
  return {
    area_id: parseAreaId(record.area_id),
    guild_id: parseGuildId(record.guild_id),
    claim_token: token,
  };
}

export function parseDispatchRequest(value: unknown): DispatchRequest {
  if (value === undefined || value === null) return { limit: 20 };
  const record = requireRequestRecord(value);
  assertOnlyKeys(record, ["limit"]);
  const limit = record.limit ?? 20;
  if (
    !Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 20
  ) {
    throw new TypeError("limit must be an integer from 1 to 20");
  }
  return { limit: limit as number };
}

export function parseAreaId(value: unknown): AreaId {
  if (
    typeof value !== "number" || !SUPPORTED_AREA_IDS.includes(value as AreaId)
  ) {
    throw new TypeError("area_id must be one of 81, 82, 83, 84, or 85");
  }
  return value as AreaId;
}

export function parseGuildId(value: unknown): string {
  if (typeof value !== "string" || !GUILD_ID_PATTERN.test(value)) {
    throw new TypeError("guild_id must contain 1 to 20 digits");
  }
  return value;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function requireRequestRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError("request body must be a JSON object");
  }
  return value;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw new TypeError("request body contains an unsupported field");
  }
}
