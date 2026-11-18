# Selection prompt signal evidence, 2026-11-19

The provider prompt formatter previously added scene-cut and high-visual markers from populated timeline arrays without consulting detector-execution receipts. This was inconsistent with scoring and the corrected Auto Genre path, which keep unavailable signals unknown. Positive source arrays alone were not execution proof.

The formatter now requires completed whole-source scene-cut receipts for scene and cut-activity annotations. It reads the actual fused segment activity, not an arbitrary number on a keyframe. The marker is HIGH_CUT_ACTIVITY, explicitly described as a scene-cut-derived heuristic rather than optical motion, story quality or viewer attention. Legacy, partial, unavailable, sampled and invalid values cannot become those markers. Source duration and segment windows must be valid. A boundary event belongs to the next half-open segment, not both.

Positive sampled OCR requires detected metadata and finite, in-window nonempty detector text. This is supporting source data, not instruction authority or a claim of OCR accuracy. A missing/empty metadata default is not a completed-OCR receipt. Existing transcript words, order and segment indexes are retained, with only the existing whitespace compaction.

Verification:101focused tests pass, including eight new prompt-evidence cases, twelve recent genre-evidence cases, and existing prompt, clip-quality, genre, selection-boundary and resolution checks. Both frontend/server typechecks pass. Positive fixtures were corrected to supply actual completed receipts and fused-segment metrics rather than assert that an unverified keyframe number is measured motion. This is not a full application test result.

No provider or media operation was repeated. The separately recorded one-call selection result at docs/qualification/selection-retained-text-only-20261119.md used the earlier prompt revision and remains its own measured evidence. These new marker rules have source/unit verification only. No new genre/editorial accuracy or downstream video-quality claim follows.

Disk was near the256MiB floor during final review, around278MiB free. No further media/provider/install work was attempted. The worktree node_modules is symlinked into shared dependencies: its Vite cache is regenerable but not exclusively owned, so it is not a safe blanket-delete target. Older browser profiles, source caches, retained source/ASR/evidence and fixture DBs were left untouched.
