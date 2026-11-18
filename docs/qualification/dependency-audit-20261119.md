# Dependency audit checkpoint, 2026-11-19

Read-only npm audit --package-lock-only on the backup tree reported two moderate frontend dependency entries and zero server entries. No packages were installed and no lockfile was changed. Registry results are time-specific, not proof of security.

The two entries are react-router and its dependent react-router-dom, both installed/locked6.30.6. The underlying current reviewed advisories are:

- Open redirect through attacker-supplied navigation paths, affected>=6.0.0,<7.18.0: https://github.com/advisories/GHSA-wrjc-x8rr-h8h6
- SSR-hydration constructor injection, affected>=6.4.0,<7.18.0: https://github.com/advisories/GHSA-337j-9hxr-rhxg

Both current advisory pages were fetched and read. The SSR advisory explicitly excludes Declarative Mode. This app uses client React createRoot and BrowserRouter; no application hydrateRoot/SSR router was found in the targeted source review. This reduces that advisory's apparent applicability but does not waive the unresolved dependency finding.

Login/signup return paths are allowlisted to /projects/new or a query on that path. This is not a complete navigation-sink reachability audit, and the redirect advisory remains unresolved. The registry offers a major router upgrade, so an install and regression/route-migration plan is needed before a dependency fix can be qualified. No such install occurred under the current no-install boundary.

GitHub's push-time warning of13vulnerabilities, including one critical and three high, explicitly concerns the unchanged default main branch, not this backup tree's fresh lock audit. Keep those scopes separate. The verified warning link is https://github.com/moizshaikh38/ai-video-content-generator/security/dependabot .

Installed Vite remains6.4.3 while the backup lock specifies6.4.6. Therefore lock-only audit and typecheck results must not be represented as a clean installed-tree security result. No release/deploy or production security qualification follows from this checkpoint.

Raw audit JSON is retained locally alongside the Studio evidence as root-lock-audit.json and server-lock-audit.json. Zero server entries means no advisories returned for that lock at this check, not proof that the server is safe.
