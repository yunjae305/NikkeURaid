import { beforeEach, describe, expect, it, vi } from "vitest";

const adminMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/lib/supabase/admin-client", () => ({
  createSupabaseAdminClient: adminMocks.createClient,
}));

import { POST } from "./route";

function lookupRequest(body: unknown) {
  return new Request("http://localhost/api/guilds/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/guilds/lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminMocks.createClient.mockReturnValue({
      functions: { invoke: adminMocks.invoke },
    });
  });

  it("rejects unsupported areas and malformed guild IDs", async () => {
    const response = await POST(
      lookupRequest({ area_id: 99, guild_id: "not-a-number" }),
    );

    expect(response.status).toBe(400);
    expect(adminMocks.createClient).not.toHaveBeenCalled();
  });

  it("forwards the exact request-sync body and returns 202 while queued", async () => {
    adminMocks.invoke.mockResolvedValue({
      data: { sync_state: "pending" },
      error: null,
    });

    const response = await POST(
      lookupRequest({ area_id: 83, guild_id: "28517" }),
    );

    expect(adminMocks.invoke).toHaveBeenCalledWith("request-sync", {
      body: { area_id: 83, guild_id: "28517" },
    });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      href: "/u/83/28517",
      syncState: "pending",
    });
  });

  it.each(["ok", "auth_required", "dead"])(
    "returns 200 for the %s domain state",
    async (syncState) => {
      adminMocks.invoke.mockResolvedValue({
        data: { sync_state: syncState },
        error: null,
      });

      const response = await POST(
        lookupRequest({ area_id: 83, guild_id: "28517" }),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).syncState).toBe(syncState);
    },
  );

  it("fails closed when the server credential is missing", async () => {
    adminMocks.createClient.mockImplementation(() => {
      throw new Error("missing secret");
    });

    const response = await POST(
      lookupRequest({ area_id: 83, guild_id: "28517" }),
    );

    expect(response.status).toBe(503);
    expect(adminMocks.invoke).not.toHaveBeenCalled();
  });

  it.each([
    {
      upstreamStatus: 503,
      apiStatus: 503,
      message: "수집 세션이 만료되었습니다.",
    },
    {
      upstreamStatus: 403,
      apiStatus: 403,
      message: "조회 권한이 없습니다.",
    },
    {
      upstreamStatus: 404,
      apiStatus: 404,
      message: "유니온을 찾지 못했습니다.",
    },
  ])(
    "maps upstream $upstreamStatus to an explicit Korean error",
    async ({ upstreamStatus, apiStatus, message }) => {
      adminMocks.invoke.mockResolvedValue({
        data: null,
        error: {
          context: Response.json(
            {
              error: {
                code:
                  upstreamStatus === 503
                    ? "upstream_auth_required"
                    : "upstream_error",
                detail: "private detail",
              },
            },
            { status: upstreamStatus },
          ),
        },
      });

      const response = await POST(
        lookupRequest({ area_id: 83, guild_id: "999999" }),
      );
      const payload = await response.json();

      expect(response.status).toBe(apiStatus);
      expect(payload.error).toContain(message);
      expect(JSON.stringify(payload)).not.toContain("private detail");
    },
  );

  it("does not expose upstream function errors", async () => {
    adminMocks.invoke.mockResolvedValue({
      data: null,
      error: { message: "secret upstream detail" },
    });

    const response = await POST(
      lookupRequest({ area_id: 83, guild_id: "28517" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(JSON.stringify(payload)).not.toContain("secret upstream detail");
  });

  it("passes a FunctionsHttpError rate limit through as a friendly 429", async () => {
    adminMocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: Response.json(
          { error: { code: "rate_limited" } },
          { status: 429 },
        ),
      },
    });

    const response = await POST(
      lookupRequest({ area_id: 83, guild_id: "28517" }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "조회 요청이 많습니다. 잠시 뒤 다시 시도해 주세요.",
    });
  });
});
