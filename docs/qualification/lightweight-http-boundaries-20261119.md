# Lightweight HTTP boundary verification

2026-11-19 approximately 02:33 to 02:35 IST. No build, media, live account request, provider call or database mutation.

## Existing authentication wiring, fixture only

`server/scripts/local-qualification/auth-isolation-http.mts` used the unchanged authentication middleware, actual Supabase SDK HTTP, and a deliberately local synthetic identity service. Twenty concurrent requests split between two distinct synthetic owners retained the correct request identity in AsyncLocalStorage before and after staggered awaits. The outside caller context had no owner. A synthetic identity-service 503 returned 401/AUTH_INVALID without reaching downstream code. Aggregate sampled process-group RSS was 197,427,200 bytes, runtime 0.79 seconds. This is not hosted JWT cryptography, full load or production identity-service availability qualification.

## Actual expensive-operation rate limiter

`server/scripts/local-qualification/http-rate-boundary.mts` used a real loopback HTTP server and the actual expensive-operation limiter. Express trust proxy was false, matching the default application configuration. Seventeen requests each supplied a different forged unsigned JWT subject and spoofed X-Forwarded-For address. The socket identity stayed loopback. The first 15 reached the fixture route, the next two received 429/RATE_LIMITED with Retry-After. Exactly 15 downstream calls occurred. Aggregate sampled process-group RSS was 179,474,432 bytes, runtime 0.40 seconds. No expensive operation or paid service was invoked. Production proxy topology and distributed/multi-instance rate limiting remain unqualified.

## Preserved authentication finding, no implementation change

Source inspection found no application-set deadline or response-size cap around the current SDK getUser HTTP/JSON path. This suggests a stalled identity service may hold a request until lower-level network timeouts. It is a source finding, not an observed production outage or measured maximum delay.

Authentication implementation changes are on hold under the scope restriction. No existing auth middleware or Supabase configuration was edited. A proposed new helper was written but never imported, tested, executed, committed or pushed. On receiving the restriction it was moved outside the source tree to a private inactive-proposal folder, not integrated. The existing implementation files have no diff from c0a20f0. Only test fixtures and records are included in this backup.
