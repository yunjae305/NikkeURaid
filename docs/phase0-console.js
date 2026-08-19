/*
 * NikkeURaid Phase 0 browser helper
 *
 * Run this only from a logged-in https://www.blablalink.com page. It makes seven
 * read-only API calls, sends nothing outside BlablaLink, and downloads one locally
 * redacted JSON file. Review the file once more before sharing or committing it.
 */
(async () => {
  "use strict";

  const gameOrigin = "https://api.blablalink.com";
  const commonHeaders = {
    "content-type": "application/json",
    "x-channel-type": "2",
    "x-language": "ko",
    "x-common-params": JSON.stringify({
      game_id: "16",
      area_id: "global",
      source: "pc_web",
      intl_game_id: "29080",
      language: "ko",
      env: "prod",
      data_statistics_scene: "outer",
      data_statistics_page_id: globalThis.location.href,
      data_statistics_client_type: "pc_web",
      data_statistics_lang: "ko",
    }),
  };

  if (!globalThis.location.hostname.endsWith("blablalink.com")) {
    throw new Error("로그인된 blablalink.com 페이지에서 실행해 주세요.");
  }

  const ask = (message, initialValue) => {
    const answer = globalThis.prompt(message, initialValue)?.trim();
    if (!answer) throw new Error(`${message}: 값이 필요합니다.`);
    return answer;
  };

  const areaId = Number(ask("서버 area_id (81 일본, 82 북미, 83 한국, 84 글로벌, 85 동남아)", "83"));
  if (![81, 82, 83, 84, 85].includes(areaId)) {
    throw new Error("area_id는 81~85 중 하나여야 합니다.");
  }

  const ownGuildId = ask("내 유니온 ID", "");
  const otherGuildId = ask("대조할 남의 유니온 ID", "");
  const seasonInput = Number(ask("정산이 끝난 차수 (예: 42)", "42"));
  if (!Number.isInteger(seasonInput) || seasonInput <= 0) {
    throw new Error("차수는 양의 정수여야 합니다.");
  }
  const settledSeasonId = String(seasonInput >= 1000000 ? seasonInput : 1000000 + seasonInput);

  const pause = () => new Promise((resolve) => globalThis.setTimeout(resolve, 250));

  const post = async (path, body) => {
    const startedAt = globalThis.performance.now();
    try {
      const response = await globalThis.fetch(`${gameOrigin}${path}`, {
        method: "POST",
        credentials: "include",
        headers: commonHeaders,
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { non_json_body: text.slice(0, 1000) };
      }
      await pause();
      return {
        request: { path, body },
        response: {
          http_status: response.status,
          ok: response.ok,
          duration_ms: Math.round(globalThis.performance.now() - startedAt),
          payload,
        },
      };
    } catch (error) {
      await pause();
      return {
        request: { path, body },
        response: {
          http_status: null,
          ok: false,
          duration_ms: Math.round(globalThis.performance.now() - startedAt),
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };

  const userInfo = await post("/api/ugc/proxy/standalonesite/User/GetUserInfoNew", {});
  const rawIntlOpenId = userInfo.response.payload?.data?.info?.intl_openid;
  const intlOpenId = typeof rawIntlOpenId === "string"
    ? rawIntlOpenId.replace(/^\d+-/, "")
    : "";

  const calls = {
    user_info: userInfo,
    settled_raid_other: await post("/api/game/proxy/Game/GetUnionRaidDataOfGuildSeason", {
      area_id: areaId,
      guild_id: otherGuildId,
      season_id: settledSeasonId,
    }),
    settled_raid_own_control: await post("/api/game/proxy/Game/GetUnionRaidDataOfGuildSeason", {
      area_id: areaId,
      guild_id: ownGuildId,
      season_id: settledSeasonId,
    }),
    members_other: await post("/api/game/proxy/Game/GetGuildMembers", {
      guild_id: otherGuildId,
      nikke_area_id: areaId,
    }),
    members_own_control: await post("/api/game/proxy/Game/GetGuildMembers", {
      guild_id: ownGuildId,
      nikke_area_id: areaId,
    }),
  };

  if (intlOpenId) {
    const currentBody = {
      guild_id: ownGuildId,
      nikke_area_id: areaId,
      intl_open_id: intlOpenId,
    };
    calls.current_raid = await post("/api/game/proxy/Game/GetUnionRaidData", currentBody);
    calls.current_boss_levels = await post("/api/game/proxy/Game/GetUnionRaidLevelInfo", currentBody);
  } else {
    calls.current_raid = { skipped: "GetUserInfoNew 응답에서 intl_openid를 찾지 못했습니다." };
    calls.current_boss_levels = { skipped: "GetUserInfoNew 응답에서 intl_openid를 찾지 못했습니다." };
  }

  const pseudonyms = new Map();
  const pseudonym = (kind, value) => {
    const key = `${kind}:${String(value)}`;
    if (!pseudonyms.has(key)) pseudonyms.set(key, `REDACTED_${kind}_${pseudonyms.size + 1}`);
    return pseudonyms.get(key);
  };
  const secretKey = /(cookie|token|authorization|session|secret)/i;
  const identityKey = /(openid|open_id|intl_openid|member_id|memberid)/i;
  const nicknameKey = /(nickname|nick_name|user_name|member_name|leader_name)/i;
  const guildKey = /guild_id/i;
  const guildNameKey = /(guild_name|union_name)/i;

  const redact = (value, key = "") => {
    if (secretKey.test(key)) return "REDACTED_SECRET";
    if (identityKey.test(key) && value !== null && typeof value !== "object") {
      return pseudonym("OPENID", value);
    }
    if (nicknameKey.test(key) && value !== null && typeof value !== "object") {
      return pseudonym("NICKNAME", value);
    }
    if (guildNameKey.test(key) && value !== null && typeof value !== "object") {
      return pseudonym("GUILD_NAME", value);
    }
    if (guildKey.test(key) && value !== null && typeof value !== "object") {
      return value === ownGuildId ? "REDACTED_OWN_GUILD" : "REDACTED_OTHER_GUILD";
    }
    if (Array.isArray(value)) return value.map((item) => redact(item, key));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
    }
    if (typeof value === "string") {
      return value
        .split(ownGuildId).join("REDACTED_OWN_GUILD")
        .split(otherGuildId).join("REDACTED_OTHER_GUILD")
        .split(intlOpenId || "__NO_OPENID__").join("REDACTED_OPENID");
    }
    return value;
  };

  const report = redact({
    generated_at: new Date().toISOString(),
    browser_origin: globalThis.location.origin,
    inputs: {
      area_id: areaId,
      own_guild_id: ownGuildId,
      other_guild_id: otherGuildId,
      settled_season_id: settledSeasonId,
    },
    calls,
    manual_checks_required: [
      "쿠키 이름, HttpOnly, Expires/Max-Age를 별도로 기록",
      "현재 게임 화면에서 차수 확인",
      "공유 전 실제 openid, 닉네임, 쿠키, 토큰이 남지 않았는지 재검토",
    ],
  });

  const json = JSON.stringify(report, null, 2);
  const blobUrl = globalThis.URL.createObjectURL(new globalThis.Blob([json], { type: "application/json" }));
  const link = globalThis.document.createElement("a");
  link.href = blobUrl;
  link.download = `nikkeuraid-phase0-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  globalThis.document.body.append(link);
  link.click();
  link.remove();
  globalThis.URL.revokeObjectURL(blobUrl);

  const summary = Object.fromEntries(
    Object.entries(calls).map(([name, result]) => [
      name,
      "response" in result ? result.response.http_status : result.skipped,
    ]),
  );
  globalThis.console.table(summary);
  globalThis.console.info("Phase 0 파일을 다운로드했습니다. 공유 전에 민감정보를 한 번 더 확인하세요.");
})();
