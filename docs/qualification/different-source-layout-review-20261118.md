# Different-source layout qualification - 18 November 2026

## Status

Research checkpoint only. No product changes, default activation, release, paid calls or 4K attempt. Ordinary Auto is not qualified across these genres. Product behavior remains the caption-window fix at 0d409bd.

## New screencast

Observed source page: https://github.com/narakeet/examples/blob/master/screencast-demo-video/screencast.mp4

Local interval: source 1-9 seconds, 960x540, silent qualification copy. This is an AWS console tutorial with no speaker.

Fresh actual EditorShell controls and normal queued exports showed:

- Ordinary Auto uses a centered 4:3 sharp band and loses left-side screen content.
- ScreenShare begins with unassigned placeholder views, not screen/speaker detection. Reviewing and applying both full-source panel regions retains the screen edges but repeats a small screen twice with large black gaps. It is not a good default composition.
- Existing manual Fit, Background, Blur, Full frame produces one complete screen without duplication. This is a manual override, not an automatic repair. Fine tutorial text is still small in portrait; geometry retention does not prove phone readability.
- Existing review-only OCR detected 395 rectangles across 15 sampled frames. Its coverage is explicitly incomplete. Ordinary Auto was not changed to act on it.

Local evidence: vireo-screen-auto-ui-1218, vireo-screen-auto-job-1219, vireo-screen-contain-job-1224, vireo-screen-ocr-review-job-1228, vireo-screen-fullframe-ui-1231, vireo-screen-fullframe-job-1232 under the qualification Downloads collection. MP4 contact sheets and individual frames were inspected, including actual UI preview pixels. The parent received the two manual exports with limitations.

## New basketball source

Observed source page: https://github.com/stephanj/basketballVideoAnalysis/blob/master/mini-map-tutorial/videos/mini-map-game-input.mp4

Observed acquisition endpoint: https://api.github.com/repos/stephanj/basketballVideoAnalysis/contents/mini-map-tutorial/videos

Original content SHA256: 2c36d80efda352b4c2bf754abbd570a752f4b832cef3f736dce55843215c53f2

Source interval 8-18 seconds, scaled to 960x540, silent local qualification copy. No redistribution license was established, so do not bundle or forward source pixels as a product demo. The committed fixture contains measured boxes only, not video pixels or person identities.

Fresh ordinary Auto UI and normal queued 10-second output show a centered 4:3 view losing the left basket and some players during the later action. Analysis has no face tracks but person boxes on all 42 sampled frames. This is a body-only group case, not a single speaker or walking-body case.

### Rejected body-only group proposal

The offline proposal requires dense face-free samples, repeated multi-body presence, valid finite boxes and a bounded sample gap. It constructs one static review Fit envelope, not player identity, ball tracking, hoop detection or sports classification. It does not run in the product.

An initial version used the union of all accepted body boxes. Temporarily wiring that into ordinary Auto produced a full-source view in actual UI and a queued export. The complete source restored the visible basket but made players smaller. That observation does not prove the proposed rule is reliable.

Adding repeated temporal support for both lateral extremes rejected the real basketball fixture. The far-right extreme occurs only at local times 0 and 0.24 seconds. Repeated group presence cannot validate each extreme box. The initial product wiring was removed. Do not loosen this check merely to qualify this source.

The stricter rejected proposal is archived in scripts/local-qualification/body-group-fit-proposal.ts with tests. No product module imports it. Its real-source regression explicitly expects rejection and confirms ordinary Auto remains unresolved. Synthetic tests exercise feasible shift, conflict, missing/invalid/transient evidence and duplicate clocks; they do not establish real-world coverage.

Local artifacts named basketball-fixed were generated during the temporary experiment. Those names do not mean an accepted fix. They must not be presented as released or current product output.

## Photo montage boundary correction

Earlier threshold-8 black-space proposal was rejected because lower-luma pixels in the middle shot reach source bottom 540 beyond its proposed crop. A zero-luma-only, all-frame union with padding was rendered offline, not integrated. Full-frame radio, podium and yacht negative scans remain full source. Black pixels can still be intentional scene design; pixel bounds do not establish semantic importance.

## Validation

- 32 focused tests passed after removing the temporary body-group wiring, including real-source rejection, existing ordinary Auto, face Fit anchors and pair regression.
- Frontend typecheck passed during this experiment; backend typecheck passed before the repeated-extreme refinement. No product diff remains.
- Existing safe suite: 421 passed, 0 failed, 1 skipped. This does not replace the known visual negatives or qualify automatic multi-genre selection.

## Remaining work

Auto screen/action composition, actual readable portrait tutorial selection, distinct multi-panel roles and reliable automatic multi-genre clips remain unfinished. Retain explicit manual overrides and review warnings. No HUD default activation or main deployment is authorized by this checkpoint.
