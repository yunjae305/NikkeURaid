"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";

import { ChevronRightIcon, SearchIcon } from "@/components/shared/icons";

const areas = [
  { id: 83, label: "한국" },
  { id: 81, label: "일본" },
  { id: 82, label: "북미" },
  { id: 84, label: "글로벌" },
  { id: 85, label: "동남아" },
] as const;

type RecentGuild = {
  areaId: number;
  guildId: string;
  name: string;
  viewedAt: string;
};

const recentKey = "nikke-recent-guilds";

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function readRecentGuilds() {
  return localStorage.getItem(recentKey) ?? "[]";
}

export function GuildSearch() {
  const router = useRouter();
  const [areaId, setAreaId] = useState(83);
  const [guildId, setGuildId] = useState("");
  const [error, setError] = useState("");
  const recentSnapshot = useSyncExternalStore(
    subscribeToStorage,
    readRecentGuilds,
    () => "[]",
  );
  const recent = useMemo(() => {
    try {
      const value = JSON.parse(recentSnapshot) as RecentGuild[];
      return value.filter((item) => item.areaId && item.guildId).slice(0, 5);
    } catch {
      return [];
    }
  }, [recentSnapshot]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = guildId.trim();

    if (!/^\d{1,12}$/.test(normalized)) {
      setError("유니온 ID를 숫자로 입력해 주세요.");
      return;
    }

    setError("");
    router.push(`/u/${areaId}/${normalized}`);
  }

  return (
    <section className="search-card" aria-labelledby="search-title">
      <div className="search-card-heading">
        <div>
          <p className="card-kicker">바로 조회</p>
          <h2 id="search-title">유니온 찾기</h2>
        </div>
        <SearchIcon aria-hidden="true" />
      </div>

      <form onSubmit={submit} noValidate>
        <fieldset className="area-fieldset">
          <legend>서버</legend>
          <div className="area-options">
            {areas.map((area) => (
              <button
                key={area.id}
                className="area-button"
                type="button"
                aria-pressed={areaId === area.id}
                onClick={() => setAreaId(area.id)}
              >
                {area.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="input-label" htmlFor="guild-id">
          유니온 ID
        </label>
        <div className={error ? "input-shell has-error" : "input-shell"}>
          <input
            id="guild-id"
            name="guildId"
            inputMode="numeric"
            autoComplete="off"
            placeholder="예: 28517"
            value={guildId}
            aria-describedby={error ? "guild-id-error" : "guild-id-hint"}
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              setGuildId(event.target.value.replace(/\s/g, ""));
              if (error) setError("");
            }}
          />
          <button className="search-submit" type="submit" aria-label="유니온 조회">
            <ChevronRightIcon aria-hidden="true" />
          </button>
        </div>
        <p className={error ? "field-message error-message" : "field-message"} id={error ? "guild-id-error" : "guild-id-hint"}>
          {error || "게임 안에서 보이는 숫자 ID를 입력하세요."}
        </p>
      </form>

      {recent.length > 0 ? (
        <div className="recent-section">
          <p>최근 본 유니온</p>
          <div className="recent-list">
            {recent.map((guild) => (
              <Link key={`${guild.areaId}-${guild.guildId}`} href={`/u/${guild.areaId}/${guild.guildId}`}>
                <span>{guild.name}</span>
                <small>{areas.find((area) => area.id === guild.areaId)?.label ?? guild.areaId}</small>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
