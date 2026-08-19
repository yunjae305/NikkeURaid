import { describe, expect, it } from "vitest";

import {
  DataConfigurationError,
  resolveSupabaseConfig,
} from "./client";

describe("resolveSupabaseConfig", () => {
  it("selects mock mode only when both variables are absent", () => {
    expect(resolveSupabaseConfig({})).toBeNull();
    expect(
      resolveSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "  ",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      }),
    ).toBeNull();
  });

  it("requires URL and anon key as a pair", () => {
    expect(() =>
      resolveSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toThrow(DataConfigurationError);
    expect(() =>
      resolveSupabaseConfig({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key" }),
    ).toThrow(DataConfigurationError);
  });

  it("normalizes a configured endpoint", () => {
    expect(
      resolveSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co/",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toEqual({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
  });

  it("rejects malformed and non-http endpoints", () => {
    expect(() =>
      resolveSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "not a url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toThrow(DataConfigurationError);
    expect(() =>
      resolveSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "file:///tmp/supabase",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toThrow(DataConfigurationError);
  });
});
