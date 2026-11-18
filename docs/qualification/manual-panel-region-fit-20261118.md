# Manual panel region Fit

Manual-only control in each Panel crop editor: Fill panel keeps the existing aspect-locked cover crop. Fit selected region enables a free-aspect source rectangle. Apply retains that whole region inside the panel with black bars. Reset selects the whole source. Cancel leaves the stored panel unchanged. Every panel still needs an explicit Apply before export. No new automatic role assignment or layout default.

The contain property and normalized source region roundtrip through saved projects. Cover focus/scale semantics are unchanged. Fit uses the chosen region without extra zoom. The preview clips all video outside that region; export crops it first, then scales down to fit the panel and pads with black.

## Checked locally

- 19 targeted tests: all eight panel geometries, source region roundtrip, unassigned export gate, old cover math, free-region resize boundaries and coincident/crossed pointer positions.
- Frontend and backend typechecks.
- Safe suite: 421 passed, 0 failed, 1 skipped. This is not the entire repository test suite.
- Fresh normal analysis and actual EditorShell controls on a 12-second, 1280x720 Dustborn interview/game side-by-side excerpt. Explicit Whole clip scope, manual left/right region selection. No transcript or genre/clip selection used.
- ScreenShare and Gameplay normal project update, reload, queued render job, local storage upload and signed-download protocol. Authentication, entitlements and storage are local test adapters, not production acceptance.
- Seven panel menu layouts exercised in the actual desktop editor and direct exports. Split2 covered by shared geometry tests, not this UI run.
- Eight synthetic red/blue region exports inspected for no neighboring-region leaks and black bars.

## Limits

The real source contains burned-in subtitles spanning its original two halves. Dividing those halves cuts that text. These are geometry demonstrations, not publish-ready captioned clips. Gameplay's small top panel keeps the whole interview region but makes the person smaller. Three/Four duplicate the two regions in this test; they are geometry tests, not useful semantic compositions. Manual source choice and scene scope remain necessary. A 390px editor capture still shows vertically clipped canvas with the caption workspace open; mobile layout quality is not accepted. No spending, production release, automatic HUD activation, or full4K attempt.
