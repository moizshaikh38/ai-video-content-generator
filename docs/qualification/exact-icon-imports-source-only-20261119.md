# Exact icon import optimization, source qualification only

2026-11-19 02:26 IST. Implementation: `scripts/exact-lucide-imports.mjs`, activated only for build mode in `vite.config.ts` through the already declared React plugin's Babel pipeline. No install or package declaration change.

The import visitor reads the installed lucide-react ESM barrel and maps each supported runtime named import to the exact concrete module whose default export the barrel re-exports. Local aliases are retained. Type-only imports remain type-only. Namespace/default/non-icon imports, side-effect imports and declarations with import attributes are left unchanged, not guessed. Babel's AST visitor does not rewrite strings or comments that happen to contain import text. Existing pages, hooks, components, icon geometry and editor behavior are not intentionally replaced or removed.

`node scripts/exact-lucide-imports.test.mjs` passed three source-transform tests. These covered aliases and mixed type imports, unsupported/literal handling, and all current application imports: 110 files, 933 runtime bindings, eight type-only bindings. Every runtime binding retained the installed barrel's exact default module and the application's local name. The sampled main-process peak was 166,273,024 bytes over 2.26 seconds. This was source transformation/equivalence testing, not a Vite build or rendered UI check.

A separate frontend `tsc --noEmit` validation was stopped by the 512 MiB source-check guard after 5.58 seconds, sampled RSS 537,030,656 bytes, no diagnostics before termination. Therefore full frontend type checking remains unverified after this change. The check did not complete successfully and was not retried at a higher cap.

No build, UI, CV, media or provider run followed the earlier explicit stop. No memory benefit, final bundle size, visual parity or ordinary export success is claimed. In particular, enabling a Babel visitor can add transformation work to a production build; avoiding the unused icon module graph is a supported source-level mechanism, not a measured net RSS improvement.

## Authorized bounded preparation test, failed guard

At approximately 02:28 IST the preparation-only exact-icon changed-input test was allowed with unchanged limits, no automatic UI/export continuation. It stopped during transformation at the aggregate 512 MiB process-group RSS guard: 536,944,640 bytes at 5.518 seconds. Available RAM was 950,292,480 bytes; disk free was 1,257,189,376 bytes. Minimum disk during the run was 1,257,172,992 bytes. No static output files were produced. Receipt: `evidence/20261119/exact-icon-build-guard.json`.

The supervisor sampled the process group and recursively found descendants, terminated its owned group/descendants and confirmed no owned live process remained after cleanup. The temporary HTML entry was preserved in the failed-run evidence folder. No other task work ran alongside preparation. An unrelated pre-existing browser was neither started nor changed by this test. No browser, CV, encoder or provider continuation occurred.

The icon dependency mapping did not establish preparation under the 512 MiB cap. Neither a net-memory improvement nor a sufficient higher capacity is measured. This remains a preparation capacity blocker, not an observed renderer defect. Source binding equivalence remains separate from the failed build and incomplete full type check. No further route or cap increase was attempted.

## Prior proposal

The bounded preparation proposal below was subsequently executed only to the guard failure above. It never authorized UI/export continuation.

Review this source-only change first. If separately allowed, run preparation alone with the same 512 MiB aggregate process-group cap, 512 MiB available RAM/disk floors and 60-second limit, no browser/API/CV/encoder or public-asset copying. Log every triggering sample and clean all owned descendants. Any guard failure ends that route with no cap increase or fallback. Only a successful static preparation result would support a separate reviewed UI/export continuation using the retained fresh analysis. No automatic continuation is authorized by this document.
