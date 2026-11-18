# Source-only input-security checks, 2026-11-19

This is a local source-level check. No production deployment, private endpoint probe, media render, dependency install or external provider call was performed.

## Fixed

- The private-IP filter previously accepted hexadecimal and expanded IPv4-mapped IPv6 addresses whose embedded IPv4 address is private, loopback or metadata/link-local. It now expands valid IPv6 into eight words before checking mapped IPv4. Native public IPv6 and public mapped IPv4 remain accepted by the pure classifier.
- Editor source validation previously returned on an own-user storage prefix before checking traversal. Traversal and encoded path separators are now rejected before that prefix can authorize the input.
- Non-HTTP FFmpeg URI inputs, including option-bearing protocol strings, previously fell through as relative filenames. Non-remote inputs containing a colon are now rejected. Controls and backslashes are rejected too.

## Checks

- 80 focused assertions pass across mapped-address, editor protocol/path, prior editor asset, encryption/billing configuration, provider-timing and transcript-review suites.
- Both frontend and server TypeScript checks pass.
- All added tests use synthetic strings and pure validation or pre-DNS direct-IP rejection. No request to private targets is made. Existing local-loopback validation test takes its documented development-only exemption.
- These checks do not show exploitation, production configuration, runtime auth coverage, tenant isolation, DNS pinning or production readiness.

## Remaining risks

- The generic editor asset predicate still accepts arbitrary relative paths and paths under the shared OS temporary directory as server-managed assets. The client save API calls that same predicate. A local path being under a shared temp directory is not proof that the requesting user owns it. Separating client-owned source references from server-issued temporary assets needs a broader owner-binding design and regression check. No sensitive local file was read or rendered during this review.
- Save-time DNS checks do not by themselves pin a subsequent fetch to the checked address. Runtime preload currently checks the host allowlist and disables redirects but does not rebind the connection to a validated address. Do not interpret the mapped-address fix as complete SSRF remediation.
- Existing deployment dependency advisories and full media/load/restart qualification remain separate open items.

The previous paid selection-only result still belongs to its recorded earlier prompt version. These source changes have not been followed by another paid or media run.
