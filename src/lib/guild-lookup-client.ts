import type { AreaId, SyncState } from "./types";

export interface GuildLookupResult {
  href: string;
  syncState: SyncState;
}

export class GuildLookupRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuildLookupRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSyncState(value: unknown): value is SyncState {
  return (
    value === "pending" ||
    value === "syncing" ||
    value === "ok" ||
    value === "auth_required" ||
    value === "dead"
  );
}

export async function requestGuildLookup(
  areaId: AreaId,
  guildId: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<GuildLookupResult> {
  let response: Response;
  try {
    response = await fetcher("/api/guilds/lookup", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ area_id: areaId, guild_id: guildId }),
    });
  } catch {
    throw new GuildLookupRequestError(
      "조회 요청을 보내지 못했습니다. 네트워크 연결을 확인해 주세요.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status !== 200 && response.status !== 202) {
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "조회 요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
    throw new GuildLookupRequestError(message);
  }

  if (!isRecord(payload) || !isSyncState(payload.syncState)) {
    throw new GuildLookupRequestError(
      "조회 요청의 응답을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
  }

  return {
    href: `/u/${areaId}/${guildId}`,
    syncState: payload.syncState,
  };
}
