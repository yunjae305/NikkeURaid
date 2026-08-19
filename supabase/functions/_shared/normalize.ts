import type {
  NormalizedAttack,
  NormalizedMember,
  NormalizedSquadMember,
} from "./contracts.ts";
import { isRecord } from "./contracts.ts";
import { SchemaError } from "./errors.ts";

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const SEASON_ID_OFFSET = 1_000_000;

export type NikkeNameMap = ReadonlyMap<number, string>;

export function normalizeIntlOpenId(payload: unknown): string {
  const info = requireRecord(requireSuccessData(payload).info, "data.info");
  const raw = requireNonEmptyString(info.intl_openid, "data.info.intl_openid");
  const normalized = raw.replace(/^\d+-/, "");
  if (
    !normalized || normalized === raw || !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    throw new SchemaError("data.info.intl_openid");
  }
  return normalized;
}

export function normalizeCurrentSeason(
  levelInfoPayload: unknown,
): number | null {
  const data = requireSuccessData(levelInfoPayload);
  requireArray(data.level_info, "data.level_info");
  const manager = requireRecord(data.manager_info, "data.manager_info");
  const rawId = manager.id;
  const seasonId = parseIntegerLike(rawId, "data.manager_info.id");
  if (seasonId === 0) return null;
  const season = seasonId > SEASON_ID_OFFSET
    ? seasonId - SEASON_ID_OFFSET
    : seasonId;
  if (season < 1 || season > 10_000) {
    throw new SchemaError("data.manager_info.id");
  }
  return season;
}

export function normalizeRaidAttacks(
  payload: unknown,
  season: number,
  names: NikkeNameMap,
): NormalizedAttack[] {
  if (!Number.isInteger(season) || season < 1) throw new SchemaError("season");
  const data = requireSuccessData(payload);
  validateOptionalSeasonIdentity(data, season);
  const rows = requireArray(data.participate_data, "data.participate_data");
  return rows.map((row, index) =>
    normalizeAttack(
      row,
      season,
      index,
      names,
      `data.participate_data[${index}]`,
    )
  );
}

export function normalizeGuildMembers(
  payload: unknown,
  expectedAreaId?: number,
  expectedGuildId?: string,
): NormalizedMember[] {
  const data = requireSuccessData(payload);
  if (expectedAreaId !== undefined && data.nikke_area_id !== expectedAreaId) {
    throw new SchemaError("data.nikke_area_id");
  }
  if (expectedGuildId !== undefined && data.guild_id !== expectedGuildId) {
    throw new SchemaError("data.guild_id");
  }
  const items = requireArray(data.items, "data.items");
  const seen = new Set<string>();
  return items.map((item, index) => {
    const path = `data.items[${index}]`;
    const row = requireRecord(item, path);
    if (expectedAreaId !== undefined) {
      const bindAreaId = requireInteger(
        row.bind_area_id,
        `${path}.bind_area_id`,
        0,
        85,
      );
      // A live roster contained one explicit 0 (unbound) sentinel. It is not
      // an identity field, so accept only that sentinel or the requested area.
      if (bindAreaId !== 0 && bindAreaId !== expectedAreaId) {
        throw new SchemaError(`${path}.bind_area_id`);
      }
    }
    const openid = requireNonEmptyString(row.member_id, `${path}.member_id`);
    if (seen.has(openid)) throw new SchemaError(`${path}.member_id`);
    seen.add(openid);
    return {
      openid,
      nickname: requireNonEmptyString(row.nickname, `${path}.nickname`),
      sync_lv: requireInteger(row.synchro_level, `${path}.synchro_level`, 0),
      commander_level: requireInteger(row.level, `${path}.level`, 0),
      icon_id: requireNonEmptyString(row.icon_id, `${path}.icon_id`),
    };
  });
}

export function gradeFromTid(tid: number): string {
  const code = tid % 100;
  if (code >= 1 && code <= 4) return `${code - 1}돌`;
  if (code >= 5 && code <= 11) return `${code - 4}코강`;
  return `?(${code})`;
}

export function cleanBossName(name: string): string {
  const cleaned = name.replace(/\s*\[.*?\]/g, "").trim();
  if (!cleaned) throw new SchemaError("attack.name_localvalues.ko");
  return cleaned;
}

function normalizeAttack(
  value: unknown,
  season: number,
  sourceIndex: number,
  names: NikkeNameMap,
  path: string,
): NormalizedAttack {
  const row = requireRecord(value, path);
  const difficulty = requireInteger(
    row.difficulty,
    `${path}.difficulty`,
    1,
    2,
  ) as 1 | 2;
  const rawDay = requireInteger(row.day, `${path}.day`, 0, 1);
  if (rawDay + 1 !== difficulty) throw new SchemaError(`${path}.day`);
  const squadRows = requireArray(row.squad, `${path}.squad`);
  if (squadRows.length < 1 || squadRows.length > 5) {
    throw new SchemaError(`${path}.squad`);
  }
  const seenSlots = new Set<number>();
  const squad = squadRows.map((item, index) => {
    const normalized = normalizeSquadMember(
      item,
      names,
      `${path}.squad[${index}]`,
    );
    if (seenSlots.has(normalized.slot)) {
      throw new SchemaError(`${path}.squad[${index}].slot`);
    }
    seenSlots.add(normalized.slot);
    return normalized;
  }).sort((left, right) => left.slot - right.slot);
  const nameValues = requireRecord(
    row.name_localvalues,
    `${path}.name_localvalues`,
  );
  const elementIds = requireArray(row.element_id, `${path}.element_id`);
  if (
    elementIds.some((element) => typeof element !== "string" || !element.trim())
  ) {
    throw new SchemaError(`${path}.element_id`);
  }

  return {
    season,
    source_index: sourceIndex,
    day: (rawDay + 1) as 1 | 2,
    step: requireInteger(row.step, `${path}.step`, 1, 5),
    difficulty,
    level: requireInteger(row.level, `${path}.level`, 1),
    boss: cleanBossName(
      requireNonEmptyString(nameValues.ko, `${path}.name_localvalues.ko`),
    ),
    element: elementIds.length > 0 ? (elementIds[0] as string).trim() : null,
    openid: requireNonEmptyString(row.openid, `${path}.openid`),
    nickname: requireNonEmptyString(row.nickname, `${path}.nickname`),
    sync_lv: squad.reduce<number | null>(
      (max, member) => max === null || member.lv > max ? member.lv : max,
      null,
    ),
    total_damage: normalizeDamage(row.total_damage, `${path}.total_damage`),
    is_final_hit: requireBoolean(row.is_final_hit, `${path}.is_final_hit`),
    squad,
    boss_id: requireNonEmptyString(row.boss_id, `${path}.boss_id`),
    icon_id: requireNonEmptyString(row.icon_id, `${path}.icon_id`),
  };
}

function normalizeSquadMember(
  value: unknown,
  names: NikkeNameMap,
  path: string,
): NormalizedSquadMember {
  const row = requireRecord(value, path);
  const tid = requireInteger(row.tid, `${path}.tid`, 1);
  const tidPrefix = Math.floor(tid / 100);
  const grade = gradeFromTid(tid);
  return {
    slot: requireInteger(row.slot, `${path}.slot`, 1, 5),
    tid,
    lv: requireInteger(row.lv, `${path}.lv`, 1),
    name: names.get(tidPrefix) ?? `Unknown(${tid})`,
    grade,
    break: grade,
    combat: requireInteger(row.combat, `${path}.combat`, 1),
  };
}

function normalizeDamage(value: unknown, path: string): string {
  if (
    typeof value !== "string" || value.length > 19 ||
    !/^(0|[1-9]\d*)$/.test(value)
  ) {
    throw new SchemaError(path);
  }
  const parsed = BigInt(value);
  if (parsed > POSTGRES_BIGINT_MAX) throw new SchemaError(path);
  return parsed.toString();
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new SchemaError(path);
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new SchemaError(path);
  return value;
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new SchemaError(path);
  return value.trim();
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new SchemaError(path);
  return value;
}

function requireInteger(
  value: unknown,
  path: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isInteger(value) || (value as number) < min ||
    (value as number) > max
  ) {
    throw new SchemaError(path);
  }
  return value as number;
}

function parseIntegerLike(value: unknown, path: string): number {
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new SchemaError(path);
}

function requireSuccessData(payload: unknown): Record<string, unknown> {
  const response = requireRecord(payload, "response");
  const code = response.code;
  if (code !== 0) {
    if (typeof code !== "number") throw new SchemaError("response.code");
    throw new SchemaError("response.code.nonzero");
  }
  return requireRecord(response.data, "data");
}

function validateOptionalSeasonIdentity(
  data: Record<string, unknown>,
  season: number,
): void {
  if (data.manager_info === undefined) return;
  const manager = requireRecord(data.manager_info, "data.manager_info");
  const seasonId = parseIntegerLike(manager.id, "data.manager_info.id");
  if (seasonId !== season && seasonId !== SEASON_ID_OFFSET + season) {
    throw new SchemaError("data.manager_info.id");
  }
}
