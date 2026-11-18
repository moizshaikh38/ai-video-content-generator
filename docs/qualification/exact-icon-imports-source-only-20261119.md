# Exact icon import optimization, source qualification only

2026-11-19 02:26 IST. Implementation: `scripts/exact-lucide-imports.mjs`, activated only for build mode in `vite.config.ts` through the already declared React plugin's Babel pipeline. No install or package declaration change.

The import visitor reads the installed lucide-react ESM barrel and maps each supported runtime named import to the exact concrete module whose default export the barrel re-exports. Local aliases are retained. Type-only imports remain type-only. Namespace/default/non-icon imports, side-effect imports and declarations with import attributes are left unchanged, not guessed. Babel's AST visitor does not rewrite strings or comments that happen to contain import text. Existing pages, hooks, components, icon geometry and editor behavior are not intentionally replaced or removed.

`node scripts/exact-lucide-imports.test.mjs` passed three source-transform tests. These covered aliases and mixed type imports, unsupported/literal handling, and all current application imports: 110 files, 933 runtime bindings, eight type-only bindings. Every runtime binding retained the installed barrel's exact default module and the application's local name. The sampled main-process peak was 166,273,024 bytes over 2.26 seconds. This was source transformation/equivalence testing, not a Vite build or rendered UI check.

A separate frontend `tsc --noEmit` validation was stopped by the 512 MiB source-check guard after 5.58 seconds, sampled RSS 537,030,656 bytes, no diagnostics before termination. Therefore full frontend type checking remains unverified after this change. The check did not complete successfully and was not retried at a higher cap.

No build, UI, CV, media or provider run followed the earlier explicit stop. No memory benefit, final bundle size, visual parity or ordinary export success is claimed. In particular, enabling a Babel visitor can add transformation work to a production build; avoiding the unused icon module graph is a supported source-level mechanism, not a measured net RSS improvement.

## Future bounded proposal, not executed

Review this source-only change first. If separately allowed, run preparation alone with the same 512 MiB aggregate process-group cap, 512 MiB available RAM/disk floors and 60-second limit, no browser/API/CV/encoder or public-asset copying. Log every triggering sample and clean all owned descendants. Any guard failure ends that route with no cap increase or fallback. Only a successful static preparation result would support a separate reviewed UI/export continuation using the retained fresh analysis. No automatic continuation is authorized by this document.
