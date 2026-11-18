# Vite lock-only advisory update, 2026-11-18

## Scope and result

The root package declaration and lock now select Vite 6.4.6 instead of the previously resolved 6.4.3. This is a same-major, lock-only change. No installed dependency, main branch or deployed runtime was changed.

A fresh root `npm audit --package-lock-only --json` changed from 3 entries (1 high, 2 moderate) to 2 moderate entries: react-router and react-router-dom. This is the root lock's audit, not the complete repository or production security status. Router remains unresolved and requires separate compatibility work.

## Grounding

Version metadata was read directly from https://registry.npmjs.org/vite/6.4.6 (5,573 bytes). The dependencies, optional dependencies, peer dependencies, optional-peer metadata, Node engines, executable mapping and license were compared structurally against the existing Vite lock entry. All matched. Therefore no transitive resolution was changed or invented. Only the direct requested range, locked version, registry tarball URL and registry-declared SHA-512 integrity changed. The archive was not downloaded, so its bytes have not independently been checked against that integrity.

Relevant audit sources include https://github.com/advisories/GHSA-587h-7wmj-h5pm and https://github.com/advisories/GHSA-rq7h-c2jc-7f22 .

## Resource stop and revised method

An initial isolated npm lock-only resolution attempt exceeded its 20 MiB work bound and was terminated after 1.51 seconds. Peak measured work was 27,894,768 bytes at the sampling stop; no package/lock update or node_modules was produced. Its owned cache was removed. The approved replacement used only version-specific metadata and structural equality assertions, not a larger install retry.

## Qualification still required

The installed Vite remains 6.4.3. The existing node_modules symlink was unchanged. No build using 6.4.6 was run, and no runtime advisory remediation is claimed. Before deploying, perform an approved isolated install with integrity verification, build and functional checks, and reassess all root/server audits. This change is backup engineering only.
