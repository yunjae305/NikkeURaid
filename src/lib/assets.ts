const DEFAULT_ASSET_BASE_URL =
  "https://cdn.jsdelivr.net/gh/yunjae305/NikkeURaid@main/assets";

export function assetUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_ASSET_BASE_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_ASSET_BASE_URL;
  const encodedPath = path
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/${encodedPath}`;
}
