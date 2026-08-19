import { assetUrl } from "./assets";
import type {
  AreaId,
  BossProgress,
  ComboRanking,
  DashboardModel,
  DashboardQuery,
  GuildSummary,
  MemberGrowth,
  MemberRanking,
  NikkeUsage,
  ParticipationMember,
  RaidPeriod,
  SeasonTrend,
  SyncState,
} from "./types";

interface MockMember {
  openid: string;
  nickname: string;
  displayName: string;
}

interface MockNikke {
  name: string;
  image: string;
}

interface MockAttack {
  season: number;
  day: number;
  openid: string;
  nickname: string;
  boss: string;
  damage: number;
  syncLevel: number;
  isFinalHit: boolean;
  squad: MockNikke[];
}

interface MockBoss {
  step: number;
  name: string;
  weak: string;
  image: string;
  maxHp: number;
}

const MOCK_SEASONS = [40, 41, 42, 43] as const;
const MOCK_DAYS = [1, 2] as const;
const DEFAULT_SEASON = 43;
const DEFAULT_DAY = 2;

const NIKKES = {
  리타: { name: "리타", image: assetUrl("nikke/si_c082_00_s.png") },
  크라운: { name: "크라운", image: assetUrl("nikke/si_c330_00_s.png") },
  나가: { name: "나가", image: assetUrl("nikke/si_c450_00_s.png") },
  "라피 : 레드 후드": {
    name: "라피 : 레드 후드",
    image: assetUrl("nikke/si_c016_00_s.png"),
  },
  앨리스: { name: "앨리스", image: assetUrl("nikke/si_c191_00_s.png") },
  도로시: { name: "도로시", image: assetUrl("nikke/si_c233_00_s.png") },
  블랑: { name: "블랑", image: assetUrl("nikke/si_c270_00_s.png") },
  누아르: { name: "누아르", image: assetUrl("nikke/si_c271_00_s.png") },
  레드후드: { name: "레드 후드", image: assetUrl("nikke/si_c470_00_s.png") },
  모더니아: { name: "모더니아", image: assetUrl("nikke/si_c260_00_s.png") },
  루주: { name: "루주", image: assetUrl("nikke/si_c272_00_s.png") },
  신데렐라: { name: "신데렐라", image: assetUrl("nikke/si_c511_00_s.png") },
  홍련: { name: "홍련", image: assetUrl("nikke/si_c222_00_s.png") },
  맥스웰: { name: "맥스웰", image: assetUrl("nikke/si_c102_00_s.png") },
  티아: { name: "티아", image: assetUrl("nikke/si_c451_00_s.png") },
  볼륨: { name: "볼륨", image: assetUrl("nikke/si_c431_00_s.png") },
  "아니스 : 스파클링 서머": {
    name: "아니스 : 스파클링 서머",
    image: assetUrl("nikke/si_c015_00_s.png"),
  },
  프리바티: { name: "프리바티", image: assetUrl("nikke/si_c170_00_s.png") },
  헬름: { name: "헬름", image: assetUrl("nikke/si_c352_00_s.png") },
  "홍련 : 흑영": {
    name: "홍련 : 흑영",
    image: assetUrl("nikke/si_c225_00_s.png"),
  },
} as const satisfies Record<string, MockNikke>;

const SQUADS: readonly (readonly MockNikke[])[] = [
  [NIKKES.리타, NIKKES.크라운, NIKKES.나가, NIKKES["라피 : 레드 후드"], NIKKES.앨리스],
  [NIKKES.도로시, NIKKES.블랑, NIKKES.누아르, NIKKES.레드후드, NIKKES.모더니아],
  [NIKKES.루주, NIKKES.크라운, NIKKES.신데렐라, NIKKES.홍련, NIKKES.맥스웰],
  [NIKKES.리타, NIKKES.티아, NIKKES.나가, NIKKES.앨리스, NIKKES.레드후드],
  [NIKKES.볼륨, NIKKES.블랑, NIKKES.누아르, NIKKES["아니스 : 스파클링 서머"], NIKKES.프리바티],
  [NIKKES.도로시, NIKKES.크라운, NIKKES.나가, NIKKES.헬름, NIKKES.모더니아],
  [NIKKES.리타, NIKKES.크라운, NIKKES.신데렐라, NIKKES["홍련 : 흑영"], NIKKES.앨리스],
  [NIKKES.루주, NIKKES.티아, NIKKES.나가, NIKKES.홍련, NIKKES.맥스웰],
] as const;

const BOSSES_BY_SEASON: Readonly<Record<number, readonly MockBoss[]>> = {
  40: [
    boss(1, "두리안", "풍압", "Enemy_Mace.webp", 99_856_279_200),
    boss(2, "헤비메탈", "수냉", "Enemy_Heavy_Metal.webp", 99_856_279_200),
    boss(3, "모더니아", "작열", "Enemy_Modernia_%28A.N.M.I.%29.webp", 150_841_813_600),
    boss(4, "리빌드 벌컨R", "철갑", "Enemy_Rebuild_Vulcan_R.webp", 99_856_279_200),
    boss(5, "알트아이젠", "전격", "Enemy_Alteisen_MK.VI_%28P.S.I.D.%29.webp", 150_841_813_600),
  ],
  41: [
    boss(1, "시니스터", "작열", "Enemy_Sinister.webp", 99_856_279_200),
    boss(2, "레플리카 레드 슈즈", "풍압", "Enemy_Replica_Red_Shoes.webp", 99_856_279_200),
    boss(3, "니힐리스타", "수냉", "Enemy_Nihilister_Boss.webp", 150_841_813_600),
    boss(4, "리빌드 빅 토르소", "전격", "Enemy_Rebuild_Stout.webp", 99_856_279_200),
    boss(5, "울트라", "철갑", "Enemy_Ultra.webp", 150_841_813_600),
  ],
  42: [
    boss(1, "두리안", "수냉", "Enemy_Mace.webp", 99_856_279_200),
    boss(2, "닥터", "철갑", "Enemy_Doctor.webp", 99_856_279_200),
    boss(3, "알트아이젠", "전격", "Enemy_Alteisen_MK.VI_%28P.S.I.D.%29.webp", 150_841_813_600),
    boss(4, "리빌드 오벨리스크", "작열", "Enemy_Rebuild_Obelisk.webp", 99_856_279_200),
    boss(5, "크라켄", "풍압", "Enemy_Kraken_%28D.M.T.R.%29.webp", 150_841_813_600),
  ],
  43: [
    boss(1, "선바스", "전격", "Enemy_Sunbather.webp", 99_856_279_200),
    boss(2, "플레이트", "작열", "Enemy_Plate.webp", 99_856_279_200),
    boss(3, "토커티브", "수냉", "Enemy_Chatterbox.webp", 150_841_813_600),
    boss(4, "리빌드 핑거즈", "풍압", "Enemy_Rebuild_Fingers.webp", 99_856_279_200),
    boss(5, "마테리얼H", "철갑", "Enemy_Material_H_%28D.M.T.R.%29.webp", 150_841_813_600),
  ],
};

function boss(
  step: number,
  name: string,
  weak: string,
  image: string,
  maxHp: number,
): MockBoss {
  return {
    step,
    name,
    weak,
    image: assetUrl(`boss/${image}`),
    maxHp,
  };
}

const MOCK_MEMBERS: readonly MockMember[] = Array.from(
  { length: 32 },
  (_, index) => {
    const suffix = String(index + 1).padStart(2, "0");
    return {
      openid: `mock-openid-${suffix}`,
      nickname: `레이더 ${suffix}`,
      displayName: `레이더 ${suffix}`,
    };
  },
);

function triesFor(season: number, day: number, memberIndex: number): number {
  if (season === DEFAULT_SEASON && day === DEFAULT_DAY) {
    if (memberIndex === 28 || memberIndex === 29) return 0;
    if (memberIndex === 30) return 1;
    if (memberIndex === 31) return 2;
    return 3;
  }

  if (day === 1) return 3;
  return memberIndex >= 30 ? 2 : 3;
}

function buildMockAttacks(): MockAttack[] {
  const attacks: MockAttack[] = [];

  for (const season of MOCK_SEASONS) {
    const seasonBosses = BOSSES_BY_SEASON[season];
    for (const day of MOCK_DAYS) {
      for (const [memberIndex, member] of MOCK_MEMBERS.entries()) {
        const tries = triesFor(season, day, memberIndex);
        for (let tryIndex = 0; tryIndex < tries; tryIndex += 1) {
          const bossIndex = (memberIndex * 3 + tryIndex + season + day) % 5;
          const seasonFactor = 0.82 + (season - 40) * 0.06;
          const dayFactor = day === 2 ? 1.08 : 0.94;
          const tryFactor = 1 - tryIndex * 0.04;
          const baseDamage = 8_800_000_000 - memberIndex * 105_000_000;

          attacks.push({
            season,
            day,
            openid: member.openid,
            nickname: member.nickname,
            boss: seasonBosses[bossIndex].name,
            damage: Math.round(baseDamage * seasonFactor * dayFactor * tryFactor),
            syncLevel: 286 + (season - 40) * 7 + (memberIndex % 6),
            isFinalHit: false,
            squad: [...SQUADS[(memberIndex + tryIndex + season + day) % SQUADS.length]],
          });
        }
      }
    }
  }

  for (const season of MOCK_SEASONS) {
    for (const day of MOCK_DAYS) {
      const bosses = BOSSES_BY_SEASON[season];
      for (const currentBoss of bosses) {
        const matching = attacks.filter(
          (attack) =>
            attack.season === season &&
            attack.day === day &&
            attack.boss === currentBoss.name,
        );
        const damage = sum(matching.map((attack) => attack.damage));
        if (damage >= currentBoss.maxHp && matching.length > 0) {
          matching.at(-1)!.isFinalHit = true;
        }
      }
    }
  }

  return attacks;
}

const MOCK_ATTACKS = buildMockAttacks();

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function percentChange(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function periods(): RaidPeriod[] {
  return MOCK_SEASONS.flatMap((season) =>
    MOCK_DAYS.map((day) => ({
      season,
      day,
      difficulty: day === 1 ? ("normal" as const) : ("hard" as const),
      label: `${season}차 · Day ${day}`,
      isLatest: season === DEFAULT_SEASON && day === DEFAULT_DAY,
    })),
  ).sort((a, b) => b.season - a.season || b.day - a.day);
}

function selectPeriod(query: DashboardQuery, available: RaidPeriod[]): RaidPeriod {
  const season = query.season ?? DEFAULT_SEASON;
  const day = query.day ?? Math.max(
    ...available.filter((period) => period.season === season).map((period) => period.day),
  );
  const selected = available.find(
    (period) => period.season === season && period.day === day,
  );

  if (!selected) {
    throw new RangeError(`지원하지 않는 레이드 기간입니다: ${season}차 Day ${day}`);
  }
  return selected;
}

function buildRanking(attacks: readonly MockAttack[]): MemberRanking[] {
  const totalDamage = sum(attacks.map((attack) => attack.damage));

  return MOCK_MEMBERS.map((member) => {
    const memberAttacks = attacks.filter(
      (attack) => attack.openid === member.openid,
    );
    const damage = sum(memberAttacks.map((attack) => attack.damage));

    return {
      rank: 0,
      openid: member.openid,
      displayName: member.displayName,
      damage,
      tries: memberAttacks.length,
      bestHit: Math.max(0, ...memberAttacks.map((attack) => attack.damage)),
      syncLevel:
        memberAttacks.length === 0
          ? null
          : Math.max(...memberAttacks.map((attack) => attack.syncLevel)),
      finalHits: memberAttacks.filter((attack) => attack.isFinalHit).length,
      contributionPct: totalDamage === 0 ? 0 : (damage / totalDamage) * 100,
    };
  })
    .filter((member) => member.tries > 0)
    .sort((a, b) => b.damage - a.damage || a.displayName.localeCompare(b.displayName))
    .map((member, index) => ({ ...member, rank: index + 1 }));
}

function buildParticipation(
  attacks: readonly MockAttack[],
): ParticipationMember[] {
  return MOCK_MEMBERS.map((member) => {
    const memberAttacks = attacks.filter(
      (attack) => attack.openid === member.openid,
    );
    const tries = memberAttacks.length;

    return {
      openid: member.openid,
      displayName: member.displayName,
      nickname: member.nickname,
      tries,
      remaining: Math.max(0, 3 - tries),
      damage: sum(memberAttacks.map((attack) => attack.damage)),
      status:
        tries === 0
          ? ("unused" as const)
          : tries < 3
            ? ("partial" as const)
            : ("complete" as const),
    };
  }).sort(
    (a, b) =>
      b.remaining - a.remaining || a.displayName.localeCompare(b.displayName),
  );
}

function buildBosses(
  season: number,
  day: number,
  attacks: readonly MockAttack[],
): BossProgress[] {
  return BOSSES_BY_SEASON[season].map((currentBoss) => {
    const bossAttacks = attacks.filter(
      (attack) => attack.boss === currentBoss.name,
    );
    const damage = sum(bossAttacks.map((attack) => attack.damage));
    const remainingHp = Math.max(0, currentBoss.maxHp - damage);

    return {
      step: currentBoss.step,
      name: currentBoss.name,
      weak: currentBoss.weak,
      image: currentBoss.image,
      difficulty: day === 1 ? "normal" : "hard",
      level: 7 + currentBoss.step,
      maxHp: currentBoss.maxHp,
      currentHp: remainingHp,
      damage,
      attacks: bossAttacks.length,
      defeated: remainingHp === 0,
      progressPct: Math.min(100, (damage / currentBoss.maxHp) * 100),
    };
  });
}

function buildCombos(attacks: readonly MockAttack[]): ComboRanking[] {
  const groups = new Map<string, MockAttack[]>();

  for (const attack of attacks) {
    const names = attack.squad.map((unit) => unit.name).sort((a, b) => a.localeCompare(b));
    const key = `${attack.boss}\u0000${names.join("\u0001")}`;
    const group = groups.get(key) ?? [];
    group.push(attack);
    groups.set(key, group);
  }

  const ranked = [...groups.values()]
    .map((group) => {
      const damages = group.map((attack) => attack.damage);
      return {
        rank: 0,
        boss: group[0].boss,
        difficulty: group[0].day === 1 ? ("normal" as const) : ("hard" as const),
        nikkeNames: group[0].squad
          .map((unit) => unit.name)
          .sort((a, b) => a.localeCompare(b)),
        uses: group.length,
        avgDamage: Math.round(average(damages)),
        maxDamage: Math.max(...damages),
        minDamage: Math.min(...damages),
        avgSyncLevel: Math.round(average(group.map((attack) => attack.syncLevel))),
      };
    })
    .sort((a, b) => b.avgDamage - a.avgDamage || a.boss.localeCompare(b.boss));

  return ranked.map((combo, index) => ({ ...combo, rank: index + 1 }));
}

function buildUsage(attacks: readonly MockAttack[]): NikkeUsage[] {
  const usage = new Map<string, { image: string; damages: number[] }>();

  for (const attack of attacks) {
    for (const unit of attack.squad) {
      const current = usage.get(unit.name) ?? { image: unit.image, damages: [] };
      current.damages.push(attack.damage);
      usage.set(unit.name, current);
    }
  }

  return [...usage.entries()]
    .map(([name, value]) => ({
      name,
      picks: value.damages.length,
      avgDamage: Math.round(average(value.damages)),
      image: value.image,
    }))
    .sort((a, b) => b.picks - a.picks || b.avgDamage - a.avgDamage);
}

function buildSeasonTrend(): SeasonTrend[] {
  let previousDamage: number | null = null;

  return MOCK_SEASONS.map((season) => {
    const attacks = MOCK_ATTACKS.filter((attack) => attack.season === season);
    const damage = sum(attacks.map((attack) => attack.damage));
    const row: SeasonTrend = {
      season,
      damage,
      attacks: attacks.length,
      participants: new Set(attacks.map((attack) => attack.openid)).size,
      bosses: new Set(attacks.map((attack) => attack.boss)).size,
      changePct: percentChange(damage, previousDamage),
    };
    previousDamage = damage;
    return row;
  });
}

function buildMemberGrowth(season: number): MemberGrowth[] {
  return MOCK_MEMBERS.map((member) => {
    const current = MOCK_ATTACKS.filter(
      (attack) => attack.season === season && attack.openid === member.openid,
    );
    const previous = MOCK_ATTACKS.filter(
      (attack) =>
        attack.season === season - 1 && attack.openid === member.openid,
    );
    const damage = sum(current.map((attack) => attack.damage));
    const previousDamage = previous.length
      ? sum(previous.map((attack) => attack.damage))
      : null;

    return {
      openid: member.openid,
      displayName: member.displayName,
      season,
      damage,
      previousDamage,
      changePct: percentChange(damage, previousDamage),
      syncLevel:
        current.length === 0
          ? null
          : Math.max(...current.map((attack) => attack.syncLevel)),
    };
  }).sort((a, b) => b.damage - a.damage);
}

function syncStateForGuild(guildId: string): SyncState {
  if (guildId === "10001") return "syncing";
  if (guildId === "10002") return "auth_required";
  if (guildId === "10003") return "dead";
  return "ok";
}

function dashboardStatus(syncState: SyncState): DashboardModel["status"] {
  if (syncState === "auth_required") return "auth-required";
  if (syncState === "dead") return "dead";
  if (syncState === "pending" || syncState === "syncing") return "syncing";
  return "ready";
}

export function getMockGuildSummary(
  areaId: AreaId,
  guildId: string,
): GuildSummary | null {
  const normalizedGuildId = guildId.trim();
  if (!normalizedGuildId) return null;

  const syncState = syncStateForGuild(normalizedGuildId);
  return {
    areaId,
    guildId: normalizedGuildId,
    name: "샘플 유니온",
    memberCount: MOCK_MEMBERS.length,
    rosterState: "complete",
    syncState,
    lastSyncedAt:
      syncState === "ok" ? "2026-08-19T03:18:00.000Z" : null,
  };
}

export function getMockAvailablePeriods(): RaidPeriod[] {
  return periods();
}

export function getMockDashboardModel(
  query: DashboardQuery,
): DashboardModel | null {
  const guild = getMockGuildSummary(query.areaId, query.guildId);
  if (!guild) return null;

  const availablePeriods = periods();
  const selectedPeriod = selectPeriod(query, availablePeriods);
  const selectedAttacks = MOCK_ATTACKS.filter(
    (attack) =>
      attack.season === selectedPeriod.season &&
      attack.day === selectedPeriod.day,
  );
  const ranking = buildRanking(selectedAttacks);
  const participation = buildParticipation(selectedAttacks);
  const bosses = buildBosses(
    selectedPeriod.season,
    selectedPeriod.day,
    selectedAttacks,
  );
  const combos = buildCombos(selectedAttacks);
  const usedTickets = selectedAttacks.length;
  const totalTickets = MOCK_MEMBERS.length * 3;

  return {
    source: "mock",
    status: dashboardStatus(guild.syncState),
    guild,
    selectedPeriod,
    periods: availablePeriods,
    overview: {
      totalDamage: sum(selectedAttacks.map((attack) => attack.damage)),
      totalTickets,
      usedTickets,
      remainingTickets: totalTickets - usedTickets,
      participants: new Set(selectedAttacks.map((attack) => attack.openid)).size,
      totalMembers: MOCK_MEMBERS.length,
      finalHits: selectedAttacks.filter((attack) => attack.isFinalHit).length,
      ranking,
      participation,
      bosses,
    },
    combos: {
      bosses: bosses.map((currentBoss) => currentBoss.name),
      rows: combos,
      usage: buildUsage(selectedAttacks),
    },
    trend: {
      seasons: buildSeasonTrend(),
      growth: buildMemberGrowth(selectedPeriod.season),
    },
  };
}
