import { AppError, configurationError } from "./errors.ts";
import { normalizeIntlOpenId } from "./normalize.ts";
import { type AreaId, isRecord } from "./contracts.ts";

export type BlablaEndpoint =
  | "user_info"
  | "current_raid"
  | "raid_level_info"
  | "guild_members"
  | "settled_raid";

export interface BlablaApi {
  getIntlOpenId(): Promise<string>;
  getCurrentRaid(
    areaId: AreaId,
    guildId: string,
    intlOpenId: string,
  ): Promise<unknown>;
  getRaidLevelInfo(
    areaId: AreaId,
    guildId: string,
    intlOpenId: string,
  ): Promise<unknown>;
  getGuildMembers(areaId: AreaId, guildId: string): Promise<unknown>;
  getSettledRaid(
    areaId: AreaId,
    guildId: string,
    season: number,
  ): Promise<unknown>;
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface ClientOptions {
  cookie: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const API_ORIGIN = "https://api.blablalink.com";
const ENDPOINTS: Readonly<Record<BlablaEndpoint, string>> = {
  user_info: "/api/ugc/proxy/standalonesite/User/GetUserInfoNew",
  current_raid: "/api/game/proxy/Game/GetUnionRaidData",
  raid_level_info: "/api/game/proxy/Game/GetUnionRaidLevelInfo",
  guild_members: "/api/game/proxy/Game/GetGuildMembers",
  settled_raid: "/api/game/proxy/Game/GetUnionRaidDataOfGuildSeason",
};

const COMMON_PARAMS = JSON.stringify({
  game_id: "16",
  area_id: "global",
  source: "pc_web",
  intl_game_id: "29080",
  language: "ko",
  env: "prod",
  data_statistics_scene: "outer",
  data_statistics_page_id: "https://www.blablalink.com/shiftyspad",
  data_statistics_client_type: "pc_web",
  data_statistics_lang: "ko",
});

export class BlablaApiClient implements BlablaApi {
  readonly #cookie: string;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #minIntervalMs: number;
  readonly #now: () => number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  #lastRequestAt = Number.NEGATIVE_INFINITY;
  #cachedIntlOpenId: { value: string; expiresAt: number } | null = null;

  constructor(options: ClientOptions) {
    if (!options.cookie.trim() || /[\r\n]/.test(options.cookie)) {
      throw configurationError("BLABLA_COOKIE");
    }
    this.#cookie = options.cookie;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 12_000;
    this.#minIntervalMs = options.minIntervalMs ?? 250;
    this.#now = options.now ?? Date.now;
    this.#sleep = options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async getIntlOpenId(): Promise<string> {
    const now = this.#now();
    if (this.#cachedIntlOpenId && this.#cachedIntlOpenId.expiresAt > now) {
      return this.#cachedIntlOpenId.value;
    }
    const payload = await this.#post("user_info", {});
    const value = normalizeIntlOpenId(payload);
    this.#cachedIntlOpenId = { value, expiresAt: now + 10 * 60 * 1_000 };
    return value;
  }

  getCurrentRaid(
    areaId: AreaId,
    guildId: string,
    intlOpenId: string,
  ): Promise<unknown> {
    return this.#post("current_raid", {
      guild_id: guildId,
      nikke_area_id: areaId,
      intl_open_id: intlOpenId,
    });
  }

  getRaidLevelInfo(
    areaId: AreaId,
    guildId: string,
    intlOpenId: string,
  ): Promise<unknown> {
    return this.#post("raid_level_info", {
      guild_id: guildId,
      nikke_area_id: areaId,
      intl_open_id: intlOpenId,
    });
  }

  getGuildMembers(areaId: AreaId, guildId: string): Promise<unknown> {
    return this.#post("guild_members", {
      guild_id: guildId,
      nikke_area_id: areaId,
    });
  }

  getSettledRaid(
    areaId: AreaId,
    guildId: string,
    season: number,
  ): Promise<unknown> {
    return this.#post("settled_raid", {
      area_id: areaId,
      guild_id: guildId,
      season_id: String(1_000_000 + season),
    });
  }

  async #post(
    endpoint: BlablaEndpoint,
    body: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const waitFor = this.#minIntervalMs - (this.#now() - this.#lastRequestAt);
    if (waitFor > 0) await this.#sleep(waitFor);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    try {
      this.#lastRequestAt = this.#now();
      response = await this.#fetch(`${API_ORIGIN}${ENDPOINTS[endpoint]}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-channel-type": "2",
          "x-language": "ko",
          "x-common-params": COMMON_PARAMS,
          cookie: this.#cookie,
        },
        body: JSON.stringify(body),
        redirect: "manual",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new AppError({
          code: "upstream_timeout",
          message: "BlablaLink request timed out",
          httpStatus: 504,
          retryable: true,
          safeContext: endpoint,
        });
      }
      throw new AppError({
        code: "upstream_http_error",
        message: "BlablaLink request failed",
        httpStatus: 502,
        retryable: true,
        safeContext: endpoint,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (
      response.status === 401 ||
      (endpoint === "user_info" && response.status >= 300 &&
        response.status < 400)
    ) {
      throw new AppError({
        code: "upstream_auth_required",
        message: "BlablaLink session must be refreshed",
        httpStatus: 503,
        authRequired: true,
        safeContext: endpoint,
      });
    }
    if (response.status === 403) {
      throw new AppError({
        code: "upstream_permission_denied",
        message: "BlablaLink denied access to this resource",
        httpStatus: 403,
        safeContext: endpoint,
      });
    }
    if (!response.ok) {
      throw new AppError({
        code: "upstream_http_error",
        message: "BlablaLink returned an unsuccessful response",
        httpStatus: 502,
        retryable: response.status >= 500 || response.status === 429,
        safeContext: `${endpoint}_${response.status}`,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json() as unknown;
    } catch {
      throw new AppError({
        code: "upstream_invalid_json",
        message: "BlablaLink returned an unreadable response",
        httpStatus: 502,
        retryable: true,
        safeContext: endpoint,
      });
    }
    if (
      isRecord(payload) && typeof payload.code === "number" &&
      payload.code !== 0
    ) {
      const code = payload.code;
      if (code === 300001 || endpoint === "user_info") {
        throw new AppError({
          code: "upstream_auth_required",
          message: "BlablaLink session must be refreshed",
          httpStatus: 503,
          authRequired: true,
          safeContext: `${endpoint}_api_code`,
        });
      }
      if (
        code === 1303003 || code === 1303027 || code === 1303028 || code === 403
      ) {
        throw new AppError({
          code: "upstream_permission_denied",
          message: "BlablaLink denied access to this resource",
          httpStatus: 403,
          safeContext: `${endpoint}_api_code`,
        });
      }
      if (code === 401) {
        throw new AppError({
          code: "upstream_auth_required",
          message: "BlablaLink session must be refreshed",
          httpStatus: 503,
          authRequired: true,
          safeContext: `${endpoint}_api_code`,
        });
      }
      throw new AppError({
        code: "upstream_http_error",
        message: "BlablaLink rejected the request",
        httpStatus: 502,
        retryable: false,
        safeContext: `${endpoint}_api_code`,
      });
    }
    return payload;
  }
}
