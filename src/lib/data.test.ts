import { afterEach, describe, expect, it, vi } from "vitest";

import { getDashboardModel } from "./data";
import { SupabaseReadError } from "./supabase/repository";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("data source selection", () => {
  it("uses deterministic mock data when Supabase is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const model = await getDashboardModel({ areaId: 83, guildId: "28517" });

    expect(model?.source).toBe("mock");
    expect(model?.overview.usedTickets).toBe(87);
  });

  it("surfaces configured Supabase failures instead of returning demo data", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "database unavailable" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getDashboardModel({ areaId: 83, guildId: "28517" }),
    ).rejects.toBeInstanceOf(SupabaseReadError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
