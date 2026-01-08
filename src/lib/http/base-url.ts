import { headers } from "next/headers";

export async function resolveBaseUrl() {
  const envUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");

  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  if (!host) {
    // TODO: set APP_BASE_URL for server handlers without request headers.
    return "http://localhost:3000";
  }
  return `${proto}://${host}`;
}
