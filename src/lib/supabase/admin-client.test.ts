import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  resolveSupabaseAdminConfig,
  SupabaseAdminConfigurationError,
} from "./admin-client";

describe("resolveSupabaseAdminConfig", () => {
  it("requires both the public project URL and server-only service role key", () => {
    expect(() => resolveSupabaseAdminConfig({})).toThrow(
      SupabaseAdminConfigurationError,
    );
    expect(() =>
      resolveSupabaseAdminConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      }),
    ).toThrow(SupabaseAdminConfigurationError);
  });

  it("normalizes a valid server configuration", () => {
    expect(
      resolveSupabaseAdminConfig({
        NEXT_PUBLIC_SUPABASE_URL: " https://project.supabase.co/ ",
        SUPABASE_SERVICE_ROLE_KEY: " service-role-key ",
      }),
    ).toEqual({
      url: "https://project.supabase.co",
      serviceRoleKey: "service-role-key",
    });
  });
});
