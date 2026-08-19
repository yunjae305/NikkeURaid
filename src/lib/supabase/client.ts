import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export class DataConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataConfigurationError";
  }
}

type PublicEnvironment = Partial<
  Record<"NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY", string>
>;

export function resolveSupabaseConfig(
  environment: PublicEnvironment = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
): SupabasePublicConfig | null {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url && !anonKey) return null;
  if (!url || !anonKey) {
    throw new DataConfigurationError(
      "Supabase URL과 anon key는 함께 설정해야 합니다.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new DataConfigurationError("Supabase URL 형식이 올바르지 않습니다.");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new DataConfigurationError("Supabase URL은 HTTP(S) 주소여야 합니다.");
  }

  return { url: parsedUrl.toString().replace(/\/$/, ""), anonKey };
}

export function createReadonlySupabaseClient(
  config: SupabasePublicConfig,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): SupabaseClient<Database> {
  return createClient<Database>(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch: fetcher },
  });
}
