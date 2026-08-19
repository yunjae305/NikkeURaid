import { NextResponse } from "next/server";

import { isAreaId } from "@/lib/areas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { SyncState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSyncState(value: unknown): SyncState {
  if (!isRecord(value)) return "pending";
  const state = value.sync_state ?? value.syncState ?? value.state;
  if (
    state === "pending" ||
    state === "syncing" ||
    state === "ok" ||
    state === "auth_required" ||
    state === "dead"
  ) {
    return state;
  }
  return "pending";
}

async function mapRequestSyncError(error: unknown) {
  let upstreamStatus: number | undefined;
  let upstreamCode = "";

  if (isRecord(error)) {
    const context = error.context;
    if (context instanceof Response) {
      upstreamStatus = context.status;
      try {
        const payload: unknown = await context.clone().json();
        if (isRecord(payload)) {
          const nestedError = isRecord(payload.error) ? payload.error : null;
          const code =
            payload.code ?? payload.error_code ?? nestedError?.code;
          if (typeof code === "string") upstreamCode = code.toLowerCase();
        }
      } catch {
        // Error responses are mapped from their status when no JSON body exists.
      }
    }
  }

  if (
    upstreamStatus === 401 ||
    upstreamCode.includes("auth") ||
    upstreamCode.includes("session")
  ) {
    return {
      status: 503,
      error:
        "수집 세션이 만료되었습니다. 운영자가 세션을 갱신한 뒤 다시 시도해 주세요.",
    };
  }

  if (
    upstreamStatus === 403 ||
    upstreamCode.includes("permission") ||
    upstreamCode.includes("forbidden")
  ) {
    return {
      status: 403,
      error: "이 유니온의 기록은 현재 조회 권한이 없습니다.",
    };
  }

  if (upstreamStatus === 404 || upstreamCode.includes("not_found")) {
    return {
      status: 404,
      error: "유니온을 찾지 못했습니다. 서버와 ID를 다시 확인해 주세요.",
    };
  }

  if (upstreamStatus === 429) {
    return {
      status: 429,
      error: "조회 요청이 많습니다. 잠시 뒤 다시 시도해 주세요.",
    };
  }

  return {
    status: 502,
    error: "수집 요청을 전달하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 본문은 JSON이어야 합니다." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "서버와 유니온 ID를 확인해 주세요." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const areaId = body.area_id;
  const guildId =
    typeof body.guild_id === "string" ? body.guild_id.trim() : "";

  if (!isAreaId(areaId) || !/^\d{1,12}$/.test(guildId)) {
    return NextResponse.json(
      { error: "서버와 유니온 ID를 확인해 주세요." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return NextResponse.json(
      { error: "실데이터 조회 기능이 아직 준비되지 않았습니다." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  let result;
  try {
    result = await admin.functions.invoke<unknown>("request-sync", {
      body: { area_id: Number(areaId), guild_id: guildId },
    });
  } catch {
    return NextResponse.json(
      { error: "수집 요청을 전달하지 못했습니다. 잠시 뒤 다시 시도해 주세요." },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }

  if (result.error) {
    const mappedError = await mapRequestSyncError(result.error);
    return NextResponse.json(
      { error: mappedError.error },
      { status: mappedError.status, headers: NO_STORE_HEADERS },
    );
  }

  const syncState = readSyncState(result.data);
  const accepted = syncState === "pending" || syncState === "syncing";

  return NextResponse.json(
    {
      href: `/u/${Number(areaId)}/${guildId}`,
      syncState,
    },
    { status: accepted ? 202 : 200, headers: NO_STORE_HEADERS },
  );
}
