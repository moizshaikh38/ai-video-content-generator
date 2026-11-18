# Source-only input-security checks, 2026-11-19

This is a local source-level check. No production deployment, private endpoint probe, media render, dependency install or external provider call was performed.

## Fixed

- The private-IP filter previously accepted hexadecimal and expanded IPv4-mapped IPv6 addresses whose embedded IPv4 address is private, loopback or metadata/link-local. It now expands valid IPv6 into eight words before checking mapped IPv4. Native public IPv6 and public mapped IPv4 remain accepted by the pure classifier.
- Editor source validation previously returned on an own-user storage prefix before checking traversal. Traversal and encoded path separators are now rejected before that prefix can authorize the input.
- Non-HTTP FFmpeg URI inputs, including option-bearing protocol strings, previously fell through as relative filenames. Non-remote inputs containing a colon are now rejected. Controls and backslashes are rejected too.

- The public editor PATCH now explicitly marks client-submitted tracks. These require own-user storage keys or allowlisted HTTPS assets, not relative paths or shared OS temp paths. Trusted internal generated-card/cache handling keeps its separate local-file predicate. Eight added cases check rejection/positive cases and source wiring. This is not a live HTTP/DB/production-auth qualification.
- Expanded, zero-padded native IPv6 loopback/unspecified spellings are also classified from normalized words.

## Checks

- Overlay preloading no longer buffers an unbounded response. It rechecks current destination policy, keeps redirects disabled, uses a 10-second fetch/body abort signal, rejects oversized declared lengths, and enforces a 16 MiB cap on actual streamed bytes before writing a cache file. A rejected body does not publish partial bytes. Synthetic response-stream tests cover declared-length lies, chunked overflow, cancellation, empty bodies and stream errors. This does not pin DNS or establish actual CDN behavior.
- 95 focused assertions pass across bounded-response, mapped-address, client file boundary, editor protocol/path, prior editor asset, encryption/billing configuration, provider-timing and transcript-review suites.
- Both frontend and server TypeScript checks pass.
- All added tests use synthetic strings and pure validation or pre-DNS direct-IP rejection. No request to private targets is made. Existing local-loopback validation test takes its documented development-only exemption.
- These checks do not show exploitation, production configuration, runtime auth coverage, tenant isolation, DNS pinning or production readiness.

## Remaining risks

- The production custom-Pro render orchestration now checks secondary local assets before and after preload against the actual private render directory using realpath, rejecting files in other render directories and symlink escapes. Shared `/tmp` itself is not an acceptable private render root. Current-render regular files are permitted. Primary timeline source references remain exempt only because the actual primary media path is separately resolved from the owning clip. This covers the local-asset boundary, not every aspect of primary-source ownership.
- Generated overlay/card/text-card cache names hash item identifiers instead of using path-shaped identifiers. Existing symlink cache entries are rejected.
- Actual-filesystem and actual-compiler integration with synthetic PNGs passed: an owned render file is present in compiler inputs; a foreign render file and symlink escape fail before compilation. No encoder was executed. Full production render entry remains untested after this change.
- The main PATCH integration also passed through real local HTTP/controller/service/Mongo transactions in a new retained namespace: unsafe sources and another owner do not change revision; a legitimate owned storage key commits; a stale revision conflicts. Identity middleware was synthetic, not real production JWT authentication.
- Bounded response checks passed using actual loopback HTTP for declared/chunked overflow, exact byte preservation, stalled body abort and connection close.
- 104 focused assertions pass, including prior overlay-position tests, and both TypeScript checks pass.

- Overlay fetch now uses an HTTPS transport that resolves once, rejects private/mixed answers, and pins the selected validated IP through the connection lookup callback. Hostname/Host/SNI and normal TLS verification remain in place. Agent reuse and automatic redirect following are disabled. Abort covers DNS wait, request and response stream. Only explicit nonproduction loopback development URLs keep their pre-existing exemption.
- Actual local TLS integration passed with a short-lived trusted localhost test certificate, without disabling certificate verification: exact response bytes, one system DNS resolution for the request, redirect not followed, production-mode private DNS rejection before a request, stalled TLS response abort, actual preload service cache write and oversize no-cache behavior. This is not an arbitrary internet rebinding attack simulation or public-CDN qualification.
- 108 focused tests and both TypeScript checks pass. Complete production render entry, production JWT authentication, real CDN behavior and full media/load/restart qualification remain unverified. Do not infer that these checks prove the whole application secure.
- Existing deployment dependency advisories and full media/load/restart qualification remain separate open items.

The previous paid selection-only result still belongs to its recorded earlier prompt version. These source changes have not been followed by another paid or media run.
