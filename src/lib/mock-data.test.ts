import { describe, expect, it } from "vitest";

import { getMockDashboardModel } from "./mock-data";

function readyModel() {
  const model = getMockDashboardModel({
    areaId: 83,
    guildId: "28517",
    season: 43,
    day: 2,
  });
  if (!model) throw new Error("목 대시보드가 생성되지 않았습니다.");
  return model;
}

describe("mock dashboard aggregation", () => {
  it("keeps the 32-member ticket ledger internally consistent", () => {
    const model = readyModel();
    const incomplete = model.overview.participation.filter(
      (member) => member.tries < 3,
    );

    expect(model.overview.totalMembers).toBe(32);
    expect(model.guild.rosterState).toBe("complete");
    expect(model.overview.totalTickets).toBe(96);
    expect(model.overview.usedTickets).toBe(87);
    expect(model.overview.remainingTickets).toBe(9);
    expect(incomplete).toHaveLength(4);
    expect(incomplete.map((member) => member.tries).sort()).toEqual([0, 0, 1, 2]);
    expect(
      model.overview.participation.reduce(
        (total, member) => total + member.tries,
        0,
      ),
    ).toBe(87);
  });

  it("derives rankings and bosses from the same damage ledger", () => {
    const model = readyModel();
    const rankingDamage = model.overview.ranking.reduce(
      (total, member) => total + member.damage,
      0,
    );
    const bossDamage = model.overview.bosses.reduce(
      (total, boss) => total + boss.damage,
      0,
    );
    const contribution = model.overview.ranking.reduce(
      (total, member) => total + member.contributionPct,
      0,
    );

    expect(rankingDamage).toBe(model.overview.totalDamage);
    expect(bossDamage).toBe(model.overview.totalDamage);
    expect(contribution).toBeCloseTo(100, 8);
    expect(model.overview.ranking.map((member) => member.rank)).toEqual(
      Array.from({ length: model.overview.participants }, (_, index) => index + 1),
    );
    expect(model.overview.ranking).toHaveLength(model.overview.participants);
  });

  it("keeps combo and usage counts tied to the 87 attacks", () => {
    const model = readyModel();

    expect(
      model.combos.rows.reduce((total, combo) => total + combo.uses, 0),
    ).toBe(87);
    expect(
      model.combos.usage.reduce((total, nikke) => total + nikke.picks, 0),
    ).toBe(87 * 5);
    expect(model.combos.bosses).toEqual(
      model.overview.bosses.map((boss) => boss.name),
    );
  });

  it("uses synthetic member identifiers and preserves status fixtures", () => {
    const ready = readyModel();
    const syncing = getMockDashboardModel({ areaId: 83, guildId: "10001" });
    const authRequired = getMockDashboardModel({ areaId: 83, guildId: "10002" });
    const dead = getMockDashboardModel({ areaId: 83, guildId: "10003" });

    expect(ready.source).toBe("mock");
    expect(ready.status).toBe("ready");
    expect(
      ready.overview.participation.every(
        (member) =>
          member.openid.startsWith("mock-openid-") &&
          member.displayName.startsWith("레이더 "),
      ),
    ).toBe(true);
    expect(syncing?.status).toBe("syncing");
    expect(authRequired?.status).toBe("auth-required");
    expect(dead?.status).toBe("dead");
  });

  it("rejects a period that is not in the fixture", () => {
    expect(() =>
      getMockDashboardModel({
        areaId: 83,
        guildId: "28517",
        season: 99,
        day: 2,
      }),
    ).toThrow(RangeError);
  });
});
