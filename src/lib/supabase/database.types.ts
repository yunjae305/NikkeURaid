export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableDefinition<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type ViewDefinition<Row extends Record<string, unknown>> = {
  Row: Row;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      guilds: TableDefinition<{
        area_id: number;
        guild_id: string;
        name: string | null;
        member_count: number | null;
        roster_state: string;
        sync_state: string;
        fail_count: number;
        first_seen: string;
        last_viewed: string | null;
        last_synced: string | null;
      }>;
      attacks: TableDefinition<{
        id: number;
        area_id: number;
        guild_id: string;
        season: number;
        day: number;
        step: number | null;
        difficulty: number | null;
        level: number | null;
        boss: string;
        element: string | null;
        openid: string;
        nickname: string;
        sync_lv: number | null;
        total_damage: number;
        is_final_hit: boolean;
        squad: Json;
        boss_id: string | null;
        icon_id: string | null;
        captured_at: string;
      }>;
      season_bosses: TableDefinition<{
        season: number;
        step: number;
        name: string;
        weak: string | null;
        element_id: string | null;
        img: string | null;
        hp: number[] | null;
      }>;
      boss_levels: TableDefinition<{
        area_id: number;
        guild_id: string;
        season: number;
        difficulty: number;
        boss: string;
        level: number;
        max_hp: number | null;
        current_hp: number | null;
        element_id: string | null;
        boss_id: string | null;
        icon_id: string | null;
        updated_at: string;
      }>;
      nikkes: TableDefinition<{
        tid_prefix: number;
        name: string;
        name_en: string | null;
        short_name: string | null;
        burst: string | null;
        element: string | null;
        img_code: string | null;
      }>;
    };
    Views: {
      v_member_daily: ViewDefinition<{
        area_id: number;
        guild_id: string;
        season: number;
        day: number;
        openid: string;
        nickname: string | null;
        tries: number;
        damage: number;
        best_hit: number;
        sync_lv: number | null;
        final_hits: number;
        contribution_pct: number | string;
      }>;
      v_participation: ViewDefinition<{
        area_id: number;
        guild_id: string;
        season: number;
        day: number;
        openid: string;
        display_name: string;
        nickname: string;
        tries: number;
        remaining: number;
        damage: number;
      }>;
      v_season_totals: ViewDefinition<{
        area_id: number;
        guild_id: string;
        season: number;
        damage: number;
        attacks: number;
        participants: number;
        bosses: number;
        last_attack_at: string | null;
      }>;
      v_combo_stats: ViewDefinition<{
        area_id: number;
        guild_id: string;
        season: number;
        boss: string;
        difficulty: number;
        combo: string[];
        n: number;
        avg_damage: number;
        max_damage: number;
        min_damage: number;
        avg_sync_lv: number | null;
      }>;
      v_nikke_usage: ViewDefinition<{
        area_id: number;
        guild_id: string;
        season: number;
        boss: string;
        nikke: string;
        picks: number;
        avg_damage: number;
        day: number;
        difficulty: number | null;
      }>;
      v_member_growth: ViewDefinition<{
        area_id: number;
        guild_id: string;
        openid: string;
        nickname: string | null;
        season: number;
        damage: number;
        sync_lv: number | null;
        prev_damage: number | null;
      }>;
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
