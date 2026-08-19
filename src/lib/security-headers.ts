const DEFAULT_ASSET_BASE_URL =
  "https://cdn.jsdelivr.net/gh/yunjae305/NikkeURaid@main/assets";

export interface SecurityHeaderOptions {
  assetBaseUrl?: string;
  isDevelopment?: boolean;
  supabaseUrl?: string;
}

function httpOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy({
  assetBaseUrl = process.env.NEXT_PUBLIC_ASSET_BASE_URL,
  isDevelopment = process.env.NODE_ENV !== "production",
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
}: SecurityHeaderOptions = {}) {
  const assetOrigin =
    httpOrigin(assetBaseUrl) ?? httpOrigin(DEFAULT_ASSET_BASE_URL);
  const supabaseOrigin = httpOrigin(supabaseUrl);
  const scriptSources = ["'self'", "'unsafe-inline'"];
  const connectSources = ["'self'"];

  // Next.js emits inline bootstrap/RSC scripts. A nonce-based policy would need
  // request middleware, so the static header permits inline scripts but still
  // blocks third-party script origins and production eval.
  if (isDevelopment) {
    scriptSources.push("'unsafe-eval'");
    connectSources.push("ws:", "wss:");
  }
  if (supabaseOrigin) connectSources.push(supabaseOrigin);

  const directives = [
    ["default-src", "'self'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    ["frame-src", "'none'"],
    ["object-src", "'none'"],
    ["script-src", ...scriptSources],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:", assetOrigin],
    ["font-src", "'self'", "data:"],
    ["connect-src", ...connectSources],
    ["manifest-src", "'self'"],
    ["worker-src", "'self'", "blob:"],
  ].filter((directive) => directive.every(Boolean));

  if (!isDevelopment) directives.push(["upgrade-insecure-requests"]);

  return directives.map((directive) => directive.join(" ")).join("; ");
}

export function createSecurityHeaders(options: SecurityHeaderOptions = {}) {
  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(options),
    },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
  ];
}
