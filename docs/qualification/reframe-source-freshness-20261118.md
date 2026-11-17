# Normal-consumer source freshness guard

Existing getReframeTrack checked only trim offsets and output aspect. A clip could change source path, start/end selection or base duration while keeping those offsets, and an old analysis would still appear fresh. This affects the current normal reframe fetch path, not only an off-path contract.

Analyzer now records the actual source start/end used for analysis. Effective duration derives from end_seconds-start_seconds and trim offsets, not a potentially stale duration_seconds cache. Invalid nonpositive windows fail before CV starts. getReframeTrack fetches the current path and source boundaries and requires matching explicit analyzed path/window/aspect. Legacy records lacking those fields become stale/unverified, not silently stamped with new identity. This may require reanalysis or current fallback for old automatic tracks. Manual editor state is not rewritten.

17tests pass across shared freshness, real localMongo/service fetch, strict item contract and existing reframe unit suite. Integration regression seeds an analysis that is fresh, replaces the source path with unchanged trims, moves the selection with unchanged trims and removes legacy interval provenance; each becomes stale. Server typecheck passes. No CV/heavy render/4K or actual UI/export pixels are claimed for this checkpoint.

This is a minimum clip-level guard, NOT the full item-bound source-content-version/configuration contract. Same-path content replacement, source bytes/hash, per-item source replacement, config changes and a single accepted preview/export decision still need the stronger producer/consumer integration. A matching storage path is not proof of unchanged bytes. Source path/window guard must not be marketed as composition parity completion.
