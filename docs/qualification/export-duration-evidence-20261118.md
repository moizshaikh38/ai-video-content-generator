# Export-duration consistency and historical 4K evidence, 2026-11-18

## Scope

Static failure review plus a non-render local database regression. No product render behavior changed. Actual full4K API export remains unqualified and further attempts remain stopped.

## Historical failure distinction

The first 2026-11-17 qualification fixture was built by cloning an existing clip, changing its end to 33.62s and its editor canvas/video to 2s, but leaving the original `duration_seconds` at 34.59s. The start was 31.62s. The recorded FFmpeg invocation used 34.590s, so this was not a valid 2s qualification.

- Fixture clip: `d3a7b23f-a1fa-45cd-b562-cee2d1bd1ae5`
- Editor: `1d9f50ed-ee0a-4426-a0f8-1f9a1643ffae`
- Job: `5bad6b45-4fdc-4988-acd8-6f882d987ca9`
- Construction recorded 2026-11-17 00:25:48 IST.
- Failed invocation/result recorded 00:27:29 IST; clip readback at 00:28:01 IST confirms stale duration.
- A correction to 2s and stale retry cleanup was issued at 00:28:15 IST. That command hit its 95s execution limit. The subsequent 15s read also timed out. There is no recovered readback proving that correction landed, nor a complete final FFmpeg exit/RSS/signal record for that attempt.

The duration inconsistency is established. It does not establish the resource cause of the stall. In particular, a command-execution timeout is not evidence of encoder OOM.

The later 720p six-slice shared-input buffering experiment and the later disk-full database fixture incident are separate events. Their graphs, dates and telemetry do not match this failure. They must not be used as its causal explanation.

## Does the ordinary editor create this inconsistency?

The inspected production paths do not reproduce that fixture-construction mistake:

- `createClipWithJob` calculates stored duration directly from validated start/end values rather than trusting a candidate duration field.
- `buildClipEditorUpdatePayload` sends trim offsets derived from the source envelope. It does not change the base clip endpoints/duration.
- `updateClipEditorConfig` validates using end minus start and saves trim offsets separately. It does not overwrite base duration with trimmed duration.
- The render path subtracts those offsets once from base duration.

`editorBaseDurationConsistency.test.ts` exercised actual creation and editor-save services against the existing local qualification database, with no renderer/provider calls:

1. Candidate start10/end40 and an intentionally bad candidate duration999 created a clip with base duration30.
2. Real editor payload for source12..35 saved offsets2 and5. Base30 was preserved; effective duration was23.
3. Repeating the save preserved base30, with no double subtraction.
4. A direct database mutation to end15 while retaining duration30 survived a normal save. This confirms that ordinary saving does not repair an already-inconsistent record.
5. A direct2s fixture was rejected by ordinary editor save with `TRIM_TOO_SHORT`, reinforcing that the historical fixture bypassed the usual3s minimum.

The new regression and existing sliced-envelope regression passed in isolation, 2 tests total. Server TypeScript check passed. This is service/data evidence, not browser or rendered-output proof.

## Remaining latent gap

`renderClipJob` prefers nonzero stored `duration_seconds`; ordinary editor validation and default-project construction use `end_seconds - start_seconds`. Malformed legacy or manually changed records can therefore diverge. No inspected normal editor write was found that produces the inconsistency. No automatic repair, migration or render fallback was added, because the compatibility effect and correct handling of existing records need their own decision and qualification.

## Boundary incident and cleanup

An initial regression command accidentally included the pre-existing `exportResolution.test.ts` without inspecting its subprocess side effects. It ran synthetic4K media fixtures despite the no-new-render boundary. This was reported immediately. Those checks are excluded from actual4K qualification and are not evidence that the blocked API export works.

The command completed. A process check found no remaining FFmpeg/test-runner child. Only its newly generated `/tmp/res-sf6edj` directory was removed, restoring available disk from561MB to the prior577MB. No paid call or API export was made. Before any future test execution, inspect its imports, hooks and subprocesses, including module-level fixture creation. Even test-name filtering may not suppress module-level side effects.

## Evidence needed before another actual4K attempt

A properly validated fixture must agree across endpoints, base duration, trims and editor timeline. Before execution, a bounded external observer must retain process-tree RSS, elapsed time, output growth, exit/signal, stderr and disk state even if the caller times out. The environment must have sufficient measured headroom. These are prerequisites for a separately authorized attempt, not an instruction to run it now.
