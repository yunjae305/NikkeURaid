import { describe, expect, it } from "vitest";

import {
  aggregateBossAttacks,
  aggregateNikkeUsageRows,
  SupabaseReadError,
} from "./repository";

describe("Supabase dashboard row aggregation", () => {
  it("counts every raw boss attack, including attacks without a squad-derived combo", () => {
    const result = aggregateBossAttacks([
      { boss: "Boss A", total_damage: 100 },
      { boss: "Boss A", total_damage: "250" },
      { boss: "Boss B", total_damage: 40 },
    ]);

    expect(result.get("Boss A")).toEqual({ damage: 350, attacks: 2 });
    expect(result.get("Boss B")).toEqual({ damage: 40, attacks: 1 });
  });

  it("merges per-boss Nikke usage with a pick-weighted average", () => {
    expect(
      aggregateNikkeUsageRows([
        { nikke: "Alice", picks: 2, avg_damage: 100 },
        { nikke: "Alice", picks: "1", avg_damage: "400" },
        { nikke: "Beth", picks: 1, avg_damage: 50 },
      ]).sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual([
      { name: "Alice", picks: 3, avgDamage: 200 },
      { name: "Beth", picks: 1, avgDamage: 50 },
    ]);
  });

  it("rejects malformed numeric values instead of corrupting totals", () => {
    expect(() =>
      aggregateBossAttacks([{ boss: "Boss", total_damage: "not-a-number" }]),
    ).toThrow(SupabaseReadError);
  });
});
