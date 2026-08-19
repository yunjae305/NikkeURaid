import { safeFailureNote, SchemaError } from "./errors.ts";
import {
  normalizeCurrentSeason,
  normalizeGuildMembers,
  normalizeIntlOpenId,
  normalizeRaidAttacks,
} from "./normalize.ts";
import { assert, assertEquals, assertRejects, test } from "./test-utils.ts";

function attack(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    boss_id: "boss-5",
    day: 1,
    difficulty: 2,
    element_id: ["Fire"],
    icon_id: "icon-5",
    is_final_hit: true,
    level: 7,
    monster_model_id: "monster-5",
    name_localvalues: {
      en: "Boss",
      ja: "Boss",
      ko: "리빌드 [D.M.T.R.]",
      "zh-tw": "Boss",
    },
    nickname: "테스터",
    openid: "open-id-1",
    squad: [
      { combat: 81_817, costume_id: 0, lv: 267, slot: 2, tid: 25_301 },
      { combat: 74_942, costume_id: 0, lv: 266, slot: 1, tid: 19_102 },
    ],
    step: 5,
    total_damage: "9223372036854775807",
    ...overrides,
  };
}

test("normalizes the verified attack contract without losing bigint precision", () => {
  const payload = {
    code: 0,
    data: {
      manager_info: { id: "1000042" },
      participate_data: [attack()],
    },
  };
  const result = normalizeRaidAttacks(
    payload,
    42,
    new Map([[253, "크라운"], [191, "리타"]]),
  );
  assertEquals(result[0], {
    season: 42,
    source_index: 0,
    day: 2,
    step: 5,
    difficulty: 2,
    level: 7,
    boss: "리빌드",
    element: "Fire",
    openid: "open-id-1",
    nickname: "테스터",
    sync_lv: 267,
    total_damage: "9223372036854775807",
    is_final_hit: true,
    squad: [
      {
        slot: 1,
        tid: 19_102,
        lv: 266,
        name: "리타",
        grade: "1돌",
        break: "1돌",
        combat: 74_942,
      },
      {
        slot: 2,
        tid: 25_301,
        lv: 267,
        name: "크라운",
        grade: "0돌",
        break: "0돌",
        combat: 81_817,
      },
    ],
    boss_id: "boss-5",
    icon_id: "icon-5",
  });
});

test("uses Unknown(tid) for an unseeded Nikke", () => {
  const result = normalizeRaidAttacks(
    {
      code: 0,
      data: {
        participate_data: [
          attack({ squad: [{ combat: 1, lv: 1, slot: 1, tid: 99_912 }] }),
        ],
      },
    },
    42,
    new Map(),
  );
  assertEquals(result[0].squad[0].name, "Unknown(99912)");
  assertEquals(result[0].squad[0].break, "?(12)");
});

test("normalizes current season and the explicit no-active-raid sentinel", () => {
  assertEquals(
    normalizeCurrentSeason({
      code: 0,
      data: { level_info: [], manager_info: { id: "1000043" } },
    }),
    43,
  );
  assertEquals(
    normalizeCurrentSeason({
      code: 0,
      data: { level_info: [], manager_info: { id: "43" } },
    }),
    43,
  );
  assertEquals(
    normalizeCurrentSeason({
      code: 0,
      data: { level_info: [], manager_info: { id: "0" } },
    }),
    null,
  );
});

test("normalizes exact data.items guild members including the unbound area sentinel", () => {
  const members = normalizeGuildMembers(
    {
      code: 0,
      data: {
        guild_id: "28517",
        nikke_area_id: 83,
        items: [
          {
            bind_area_id: 83,
            icon_id: "12",
            level: 400,
            member_id: "member-1",
            nickname: "길드원",
            synchro_level: 321,
          },
          {
            bind_area_id: 0,
            icon_id: "13",
            level: 401,
            member_id: "member-2",
            nickname: "미연동 길드원",
            synchro_level: 322,
          },
        ],
      },
    },
    83,
    "28517",
  );
  assertEquals(members, [
    {
      openid: "member-1",
      nickname: "길드원",
      sync_lv: 321,
      commander_level: 400,
      icon_id: "12",
    },
    {
      openid: "member-2",
      nickname: "미연동 길드원",
      sync_lv: 322,
      commander_level: 401,
      icon_id: "13",
    },
  ]);
});

test("rejects a member bound to a different concrete area", async () => {
  await assertRejects(
    () =>
      normalizeGuildMembers(
        {
          code: 0,
          data: {
            guild_id: "28517",
            nikke_area_id: 83,
            items: [{
              bind_area_id: 82,
              icon_id: "12",
              level: 400,
              member_id: "member-1",
              nickname: "길드원",
              synchro_level: 321,
            }],
          },
        },
        83,
        "28517",
      ),
    (error) =>
      error instanceof SchemaError &&
      error.safeContext === "data.items[0].bind_area_id",
  );
});

test("strips the game prefix from intl_openid", () => {
  assertEquals(
    normalizeIntlOpenId({
      code: 0,
      data: { info: { intl_openid: "29080-abc_123" } },
    }),
    "abc_123",
  );
});

test("fails closed on a changed attack shape without including raw values", async () => {
  const secretNickname = "DO_NOT_LEAK_ME";
  await assertRejects(
    () =>
      normalizeRaidAttacks(
        {
          code: 0,
          data: {
            participate_data: [
              attack({
                nickname: secretNickname,
                squad: [{ slot: 1, tid: 25_301, lv: 267 }],
              }),
            ],
          },
        },
        42,
        new Map(),
      ),
    (error) => {
      assert(error instanceof SchemaError);
      return !error.message.includes(secretNickname) &&
        error.safeContext === "data.participate_data[0].squad[0].combat";
    },
  );
});

test("rejects unsafe numeric damage instead of rounding it", async () => {
  await assertRejects(
    () =>
      normalizeRaidAttacks(
        {
          code: 0,
          data: {
            participate_data: [
              attack({ total_damage: Number.MAX_SAFE_INTEGER + 1 }),
            ],
          },
        },
        42,
        new Map(),
      ),
    (error) =>
      error instanceof SchemaError &&
      error.safeContext?.endsWith("total_damage") === true,
  );
});

test("rejects a day and difficulty pair outside the verified invariant", async () => {
  await assertRejects(
    () =>
      normalizeRaidAttacks(
        {
          code: 0,
          data: { participate_data: [attack({ day: 0, difficulty: 2 })] },
        },
        42,
        new Map(),
      ),
    (error) =>
      error instanceof SchemaError &&
      error.safeContext?.endsWith(".day") === true,
  );
});

test("preserves colliding tickets with distinct source indexes", () => {
  const duplicate = attack();
  const result = normalizeRaidAttacks(
    { code: 0, data: { participate_data: [duplicate, { ...duplicate }] } },
    42,
    new Map(),
  );
  assertEquals(result.length, 2);
  assertEquals(result.map((item) => item.source_index), [0, 1]);
  assertEquals(result[0].openid, result[1].openid);
  assertEquals(result[0].total_damage, result[1].total_damage);
});

test("rejects a historical response whose manager season does not match the request", async () => {
  await assertRejects(
    () =>
      normalizeRaidAttacks(
        { code: 0, data: { manager_info: { id: "41" }, participate_data: [] } },
        42,
        new Map(),
      ),
    (error) =>
      error instanceof SchemaError &&
      error.safeContext === "data.manager_info.id",
  );
});

test("turns schema array paths into a DB-safe failure note without raw values", () => {
  const error = new SchemaError("data.participate_data[12].squad[4].combat");
  const note = safeFailureNote(error);
  assertEquals(
    note,
    "upstream_schema_changed:data.participate_data_12_.squad_4_.combat",
  );
  assert(/^[A-Za-z0-9_./: -]+$/.test(note));
});
