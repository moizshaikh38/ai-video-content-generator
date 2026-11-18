# Ordinary Auto shared fallback: repeated faces

18 November 2026. Local/backup only, not production or verified active-speaker identification.

## Defect and narrow fix

When the ordinary measured pair Split was ineligible, `legacyFit43Plan` converted the group view to 4:3 without running the existing repeated-face constraint. This could clip one person while claiming only a generic side-context warning.

The fallback now applies existing `anchorClipFitToMeasuredFaces` after the presentation conversion. Compatible repeated faces keep 4:3 and are re-centered only if needed. Two persistent measured faces that cannot fit together cause a full-source centered shared view. Existing helper thresholds and exclusions are unchanged. No speaker model, identity, turn detector or feature gate added.

## Actual natural-source reproduction

- Existing silent-source fixture: `/downloads/recovered-source/cottonbro-two-person-12s.mp4`, SHA256 `c486f16a5f8c36bb1152fdfa8e826dce216e34dc85c34e2d7bd3bd14a88e7fd9`, 910x480, 12s.
- Before normal analyzer/actual EditorShell/direct export: `/downloads/vireo-sharedpair-before-1633`.
- After same path: `/downloads/vireo-sharedpair-after-1634`.
- Separate after save/reload, worker/upload and signed-download: `/downloads/vireo-sharedpair-job-1635`.
- Both fresh normal analyses: two tracks, zero OCR regions. No face/body evidence injection in these runtime runs. Ordinary Auto with a Fit-only policy, experimental composition/adaptive flags off.
- Before controller window width .7032967 (640 of 910 source pixels). 19 of 100 recorded face boxes exceed the window. Actual 4.8s movie frame visibly clips the left person's face.
- After window width/height 1, full-source shared view; zero of 100 recorded face boxes exceed it. Actual before/after movies and 4.8s stills inspected. People are smaller and there is more unused/blurred background.
- After direct export and worker-downloaded movie each have 360 decoded frames. All 360 frame checksums match exactly.
- Actual UI manual Fill, Fit and Split output MP4 bytes are identical before/after; only Auto output changes. This does not widen or override manual layout intent.

The job is local auth/entitlement/storage-mocked and uses an empty transcript protocol fixture on a silent source, not real transcription, source selection or speech association proof. No paid call or source download.

Reproduction uses the previously backed `fit-only-context-review.mts` and `fit-only-saved-job.mts` harnesses with this source, fresh output directories and the UI-output directory passed as `VIREO_CONTROLS_ROOT` for the job.

## Fault injection and tests

The committed existing natural-pair geometry fixture supplies repeatable unit evidence. Absent, alternating and one-sided visual mouth scores all leave the baseline ordinary pair Split byte-equivalent. Missing body boxes or removing one face every fourth sample suppress unsupported Split and use one stable shared view retaining every remaining recorded face box. These are perturbations, not actual detector failure rates or real speaker-turn evidence.

Focused tests: 35 pass, covering new shared-fallback tests plus explicit Auto, repeated-face anchoring and measured-context bridge. Backend types pass; safe suite 421 pass, 0 fail, 1 skipped. Whole-repository green is not claimed.

The initial missing-body test failed on 19 face observations before the fix and passes after. A separate no-injection Fit-only runtime then confirmed the same visible defect and repair.

## Limits

This solves avoidable clipping in the legacy shared fallback. It does not identify who is talking, decide conversational relevance, recover missed faces, prove hand/body/action completeness or achieve no-edit automatic clips. Existing unreliable audiovisual CPU model and screen-detail proposal remain offline. Natural portrait vertical-cut quality is still unqualified. Source selection/transcription gates, spending limits, main and Antigravity branches remain unchanged.
