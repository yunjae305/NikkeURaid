import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

const TOKEN_VERSION = "v1";
const CLOCK_SKEW_MS = 60_000;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function signatureFor(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createAdminSessionToken(
  secret: string,
  now = Date.now(),
  nonce = randomBytes(16).toString("base64url"),
) {
  const issuedAt = Math.floor(now);
  const expiresAt = issuedAt + ADMIN_SESSION_TTL_SECONDS * 1_000;
  const payload = [TOKEN_VERSION, issuedAt, expiresAt, nonce].join(".");

  return `${payload}.${signatureFor(payload, secret)}`;
}

export function verifyAdminSessionToken(
  token: string,
  secret: string,
  now = Date.now(),
) {
  const parts = token.split(".");
  if (parts.length !== 5) return false;

  const [version, issuedAtText, expiresAtText, nonce, signature] = parts;
  if (
    version !== TOKEN_VERSION ||
    !/^\d+$/.test(issuedAtText) ||
    !/^\d+$/.test(expiresAtText) ||
    !NONCE_PATTERN.test(nonce) ||
    !SIGNATURE_PATTERN.test(signature)
  ) {
    return false;
  }

  const payload = [version, issuedAtText, expiresAtText, nonce].join(".");
  if (!safeEqual(signature, signatureFor(payload, secret))) return false;

  const issuedAt = Number(issuedAtText);
  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) {
    return false;
  }

  const expectedLifetime = ADMIN_SESSION_TTL_SECONDS * 1_000;
  return (
    issuedAt <= now + CLOCK_SKEW_MS &&
    expiresAt > now &&
    expiresAt - issuedAt === expectedLifetime
  );
}
