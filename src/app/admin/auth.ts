import "server-only";

import { scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import {
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "./session-token";

export const ADMIN_COOKIE_NAME = "nikke_admin_session";

const MIN_PASSWORD_LENGTH = 12;
const MIN_SECRET_BYTES = 32;
const MAX_PASSWORD_LENGTH = 256;

export type AdminConfiguration =
  | {
      state: "ready";
      password: string;
      secret: string;
    }
  | {
      state: "invalid";
      issues: string[];
    };

export function getAdminConfiguration(): AdminConfiguration {
  const password = process.env.ADMIN_PASSWORD ?? "";
  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  const issues: string[] = [];

  if (!password) {
    issues.push("ADMIN_PASSWORD가 설정되지 않았습니다.");
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    issues.push(`ADMIN_PASSWORD는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
  }

  if (!secret) {
    issues.push("ADMIN_SESSION_SECRET이 설정되지 않았습니다.");
  } else if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    issues.push(`ADMIN_SESSION_SECRET은 ${MIN_SECRET_BYTES}바이트 이상이어야 합니다.`);
  }

  if (issues.length > 0) return { state: "invalid", issues };
  return { state: "ready", password, secret };
}

export function verifyAdminPassword(
  candidate: string,
  configuration: Extract<AdminConfiguration, { state: "ready" }>,
) {
  if (!candidate || candidate.length > MAX_PASSWORD_LENGTH) return false;

  const candidateHash = scryptSync(candidate, configuration.secret, 32);
  const configuredHash = scryptSync(
    configuration.password,
    configuration.secret,
    32,
  );

  return timingSafeEqual(candidateHash, configuredHash);
}

export async function hasValidAdminSession(
  configuration: Extract<AdminConfiguration, { state: "ready" }>,
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;

  return token ? verifyAdminSessionToken(token, configuration.secret) : false;
}

export async function setAdminSession(
  configuration: Extract<AdminConfiguration, { state: "ready" }>,
) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: ADMIN_COOKIE_NAME,
    value: createAdminSessionToken(configuration.secret),
    httpOnly: true,
    maxAge: ADMIN_SESSION_TTL_SECONDS,
    path: "/admin",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    maxAge: 0,
    path: "/admin",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
}
