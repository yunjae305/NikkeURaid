"use client";

import { useEffect } from "react";

import type { GuildSummary } from "@/lib/types";

const recentKey = "nikke-recent-guilds";

export function RememberGuild({ guild }: { guild: GuildSummary }) {
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(recentKey) ?? "[]") as Array<{
        areaId: number;
        guildId: string;
        name: string;
        viewedAt: string;
      }>;
      const next = [
        {
          areaId: guild.areaId,
          guildId: guild.guildId,
          name: guild.name,
          viewedAt: new Date().toISOString(),
        },
        ...stored.filter(
          (item) =>
            item.areaId !== guild.areaId || item.guildId !== guild.guildId,
        ),
      ].slice(0, 5);
      localStorage.setItem(recentKey, JSON.stringify(next));
    } catch {
      // 저장 공간이 막혀 있어도 대시보드 이용에는 영향이 없어야 한다.
    }
  }, [guild.areaId, guild.guildId, guild.name]);

  return null;
}
