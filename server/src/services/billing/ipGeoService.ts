import net from 'node:net';
import { UrlValidator } from '../../utils/urlValidator.js';
import { logger } from '../../utils/logger.js';

/**
 * Server-side IP geolocation for INITIAL gateway selection (billing spec §3).
 *
 * Security contract:
 *  - The ONLY input is the server-derived client IP (`req.ip`). Express applies
 *    TRUST_PROXY configuration when extracting it, so arbitrary X-Forwarded-For
 *    headers from direct clients can never reach this service.
 *  - Private/reserved/loopback addresses resolve to null (local dev, internal
 *    health checks) — never a billable country.
 *  - Any lookup failure, timeout, or malformed answer resolves to null; the
 *    caller then asks the customer to select their billing country.
 *  - Results are advisory only: a confirmed billing country and an existing
 *    subscription always outrank geolocation, and a gateway conflict requires
 *    explicit customer confirmation — never a silent switch.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 5000;
const LOOKUP_TIMEOUT_MS = 2500;

interface GeoCacheEntry {
  country: string | null;
  expiresAt: number;
}

const geoCache = new Map<string, GeoCacheEntry>();

/** Injectable fetch for tests; defaults to the global fetch. */
export type GeoFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

let geoFetchImpl: GeoFetch | null = null;
export function setGeoFetchForTests(impl: GeoFetch | null): void {
  geoFetchImpl = impl;
  geoCache.clear();
}

const ISO_COUNTRY_RE = /^[A-Z]{2}$/;

export function isPublicIp(ip: string): boolean {
  if (!net.isIP(ip)) return false;
  return !UrlValidator.isPrivateIp(ip);
}

/**
 * Resolves an ISO 3166-1 alpha-2 country for a public IP, or null.
 * Never throws: every failure mode is "unknown".
 */
export async function lookupCountryForIp(ip: string | null | undefined): Promise<string | null> {
  if (!ip || typeof ip !== 'string') return null;
  const clean = ip.trim();
  if (!isPublicIp(clean)) return null;

  const cached = geoCache.get(clean);
  if (cached) {
    if (Date.now() < cached.expiresAt) return cached.country;
    geoCache.delete(clean);
  }

  const country = await fetchCountry(clean);
  geoCache.set(clean, { country, expiresAt: Date.now() + CACHE_TTL_MS });
  if (geoCache.size > CACHE_MAX_ENTRIES) {
    const oldest = geoCache.keys().next().value;
    if (oldest !== undefined) geoCache.delete(oldest);
  }
  return country;
}

async function fetchCountry(ip: string): Promise<string | null> {
  const doFetch = geoFetchImpl ?? (globalThis.fetch as unknown as GeoFetch);
  if (!doFetch) return null;
  try {
    const res = await doFetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { success?: boolean; country_code?: unknown };
    if (payload?.success !== true) return null;
    const code = typeof payload.country_code === 'string' ? payload.country_code.trim().toUpperCase() : '';
    if (!ISO_COUNTRY_RE.test(code)) return null;
    return code;
  } catch (err: any) {
    // Timeouts, DNS failures, and malformed payloads are all "unknown country" —
    // the customer will be asked to select one.
    logger.info(`[IpGeo] Lookup failed for ${ip}: ${err?.message || err}`);
    return null;
  }
}

export function clearGeoCache(): void {
  geoCache.clear();
}
