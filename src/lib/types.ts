export const AREA_IDS = [81, 82, 83, 84, 85] as const;

export type AreaId = (typeof AREA_IDS)[number];

export interface Area {
  id: AreaId;
  name: string;
  shortName: string;
}

export type SyncState =
  | "pending"
  | "syncing"
  | "ok"
  | "auth_required"
  | "dead";

export type RosterState = "unknown" | "complete" | "limited";

export type DashboardStatus =
  | "ready"
  | "syncing"
  | "auth-required"
  | "dead";

export type DataSource = "mock" | "supabase";
export type Difficulty = "normal" | "hard";
export type ParticipationStatus = "complete" | "partial" | "unused";

export interface DashboardQuery {
  areaId: AreaId;
  guildId: string;
  season?: number;
  day?: number;
}

export interface GuildSummary {
  areaId: AreaId;
  guildId: string;
  name: string;
  memberCount: number;
  rosterState: RosterState;
  syncState: SyncState;
  lastSyncedAt: string | null;
}

export interface RaidPeriod {
  season: number;
  day: number;
  difficulty: Difficulty;
  label: string;
  isLatest: boolean;
}

export interface MemberRanking {
  rank: number;
  openid: string;
  displayName: string;
  damage: number;
  tries: number;
  bestHit: number;
  syncLevel: number | null;
  finalHits: number;
  contributionPct: number;
}

export interface ParticipationMember {
  openid: string;
  displayName: string;
  nickname: string;
  tries: number;
  remaining: number;
  damage: number;
  status: ParticipationStatus;
}

export interface BossProgress {
  step: number;
  name: string;
  weak: string;
  image: string | null;
  difficulty: Difficulty;
  level: number;
  maxHp: number | null;
  currentHp: number | null;
  damage: number;
  attacks: number;
  defeated: boolean;
  progressPct: number | null;
}

export interface ComboRanking {
  rank: number;
  boss: string;
  difficulty: Difficulty;
  nikkeNames: string[];
  uses: number;
  avgDamage: number;
  maxDamage: number;
  minDamage: number;
  avgSyncLevel: number | null;
}

export interface NikkeUsage {
  name: string;
  picks: number;
  avgDamage: number;
  image: string | null;
}

export interface SeasonTrend {
  season: number;
  damage: number;
  attacks: number;
  participants: number;
  bosses: number;
  changePct: number | null;
}

export interface MemberGrowth {
  openid: string;
  displayName: string;
  season: number;
  damage: number;
  previousDamage: number | null;
  changePct: number | null;
  syncLevel: number | null;
}

export interface DashboardOverview {
  totalDamage: number;
  totalTickets: number;
  usedTickets: number;
  remainingTickets: number;
  participants: number;
  totalMembers: number;
  finalHits: number;
  ranking: MemberRanking[];
  participation: ParticipationMember[];
  bosses: BossProgress[];
}

export interface DashboardCombos {
  bosses: string[];
  rows: ComboRanking[];
  usage: NikkeUsage[];
}

export interface DashboardTrend {
  seasons: SeasonTrend[];
  growth: MemberGrowth[];
}

export interface DashboardModel {
  source: DataSource;
  status: DashboardStatus;
  guild: GuildSummary;
  selectedPeriod: RaidPeriod;
  periods: RaidPeriod[];
  overview: DashboardOverview;
  combos: DashboardCombos;
  trend: DashboardTrend;
}
