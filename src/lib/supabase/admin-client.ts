import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

export interface SupabaseAdminConfig {
  url: string;
  serviceRoleKey: string;
}

export class SupabaseAdminConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseAdminConfigurationError";
  }
}

type AdminEnvironment = Partial<
  Record<"NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY", string>
>;

export function resolveSupabaseAdminConfig(
  environment: AdminEnvironment = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
): SupabaseAdminConfig {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!url || !serviceRoleKey) {
    throw new SupabaseAdminConfigurationError(
      "Supabase URL과 service role key가 필요합니다.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SupabaseAdminConfigurationError(
      "Supabase URL 형식이 올바르지 않습니다.",
    );
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new SupabaseAdminConfigurationError(
      "Supabase URL은 HTTP(S) 주소여야 합니다.",
    );
  }

  return {
    url: parsedUrl.toString().replace(/\/$/, ""),
    serviceRoleKey,
  };
}

export function createSupabaseAdminClient(
  config: SupabaseAdminConfig = resolveSupabaseAdminConfig(),
): SupabaseClient<Database> {
  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
