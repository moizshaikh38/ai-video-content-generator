# Retained participant-padding candidate, 2026-11-18

## What changed

A new offline-only `participantPaddingSeparationReview` planner option can separate synthetic padding between measured participant regions. It is not read from project settings or analysis metadata, and is off in ordinary preview/export. The existing participant review route, declared conversation split, shot window and allowed-layout gates still apply.

The candidate first requires the existing persistent face identities and complete, unambiguous body ownership. It then builds each participant's temporal union of eligible raw body and face boxes. Only padding outside those unions can change. A midpoint inside a measured horizontal or vertical gap separates padding. Raw body overlap, unmatched people, ambiguous owners, unstable tracks, and impossible bounds still abstain. Every final rectangle is checked for raw-envelope containment and positive-overlap rejection.

The planner permits this explicit offline candidate to test a `measured-subject-conflict` caused by a common single-window aspect crop, but only when a complete body-backed partition succeeds. This is a new representation of the measured subjects, not permission to crop them. Explicit/object context vetoes and other preservation reasons remain final. Review-required status remains. No hand model, semantic-context knowledge or full-body certainty is implied.

## Retained source-bound replay

The replay calls the current shared planner with recorded detections. It is not fresh analysis, interactive UI or actual export proof.

| Retained case | Existing computed plan | Explicit padding candidate |
| --- | --- | --- |
| Three-person NASA shared view, 60 samples | Shared Fit, no three-panel assignment | Unchanged. Extra/ambiguous body boxes still reject assignment |
| Three-person Apollo shared view, 60 samples | Full-source Fit with measured-subject conflict | Three unique body-backed panels. 180 raw-body and 180 face containment checks passed |
| Expedition mixed scene | Earlier shot 0–9.8098 has no four-panel plan; late 9.8098–14.014 has an existing four-panel face-window review plan | Unchanged. No new body-backed assignment |
| Older two-person case | Fit with persistent-face-conflict | Unchanged |

The Apollo temporal raw-body unions have horizontal gaps of 0.0100 and 0.0036 normalized source width. Added padding, not the measured body unions, caused the previous overlap. Synthetic padding can therefore be separated without deleting those measured regions. This single positive does not establish generalization.

The Expedition result corrects an earlier whole-clip-negative summary: its late shot already computes four review panels in the existing planner. That does not establish body-backed coverage or an ordinary automatic export.

## Checks

53 focused tests passed across participant geometry, body context, shot composition/options, legacy boundary, unresolved context, candidate policy and constrained Fit. Server TypeScript completed with exit 0. Tests cover true overlap, extra people, ambiguous ownership, temporal crossing, explicit protected content, Fit-only policy, opt-in isolation and inability to activate from persisted metadata.

Reusable replay: `server/scripts/local-qualification/retained-participant-padding.mts`. Supply source-bound retained track JSON paths; it performs no acquisition, decode, provider call, inference or render. Source media and private retained fixtures are not included in the backup.

## Open

No new preview pixels, motion quality or exported video were inspected for this candidate. UI, shared preview/export parity, varied-source qualification, source binding through an ordinary job, and practical visual acceptance remain required. Do not enable it as the default or call Auto Layout complete. Auto Genre's dependency remains unchanged.
