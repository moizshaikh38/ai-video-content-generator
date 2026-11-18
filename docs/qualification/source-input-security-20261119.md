# Source-only input-security checks, 2026-11-19

This is a local source-level check. No production deployment, private endpoint probe, media render, dependency install or external provider call was performed.

## Fixed

- The private-IP filter previously accepted hexadecimal and expanded IPv4-mapped IPv6 addresses whose embedded IPv4 address is private, loopback or metadata/link-local. It now expands valid IPv6 into eight words before checking mapped IPv4. Native public IPv6 and public mapped IPv4 remain accepted by the pure classifier.
- Editor source validation previously returned on an own-user storage prefix before checking traversal. Traversal and encoded path separators are now rejected before that prefix can authorize the input.
- Non-HTTP FFmpeg URI inputs, including option-bearing protocol strings, previously fell through as relative filenames. Non-remote inputs containing a colon are now rejected. Controls and backslashes are rejected too.

- The public editor PATCH now explicitly marks client-submitted tracks. These require own-user storage keys or allowlisted HTTPS assets, not relative paths or shared OS temp paths. Trusted internal generated-card/cache handling keeps its separate local-file predicate. Eight added cases check rejection/positive cases and source wiring. This is not a live HTTP/DB/production-auth qualification.
- Expanded, zero-padded native IPv6 loopback/unspecified spellings are also classified from normalized words.

## Checks

- 88 focused assertions pass across mapped-address, client file boundary, editor protocol/path, prior editor asset, encryption/billing configuration, provider-timing and transcript-review suites.
- Both frontend and server TypeScript checks pass.
- All added tests use synthetic strings and pure validation or pre-DNS direct-IP rejection. No request to private targets is made. Existing local-loopback validation test takes its documented development-only exemption.
- These checks do not show exploitation, production configuration, runtime auth coverage, tenant isolation, DNS pinning or production readiness.

## Remaining risks

- The generic internal editor asset predicate still accepts arbitrary relative paths and paths under the shared OS temporary directory as server-managed assets. The public PATCH no longer accepts them, but legacy persisted projects and trusted internal callers still reach the generic predicate. A local path being under a shared temp directory is not proof that the requesting user owns it. Render-time ownership binding for legacy saved assets remains open. No sensitive local file was read or rendered during this review.
- Save-time DNS checks do not by themselves pin a subsequent fetch to the checked address. Runtime preload currently checks the host allowlist and disables redirects but does not rebind the connection to a validated address. Do not interpret the mapped-address fix as complete SSRF remediation.
- Existing deployment dependency advisories and full media/load/restart qualification remain separate open items.

The previous paid selection-only result still belongs to its recorded earlier prompt version. These source changes have not been followed by another paid or media run.
