# Manual panel subject seed geometry

Local current-only change; no semantic game/screen detector or automatic role assignment.

ScreenShare/Gameplay first-view subject suggestions used source center directly as object-position. At zoom1.8 and the panel's own aspect this displaces the intended center. New optional source dimensions/canvas aspect convert source center through each panel's exact cover window. Old call sites without dimensions retain old behavior. Existing panel slots selected earlier are retained by applyItemLayout. Suggestions remain unassigned until explicit crop-view Apply; export guard remains.

Actual ordinary UI picks and both panel CropBox Apply actions on the studio source were captured. A test-harness noop item-update callback initially meant Apply did not save: fixed harness callback wiring and reran both baseline6358a5c and current. Product callback was not implicated. Final assigned slots persisted and normal saved/reloaded Pro jobs completed.3math regressions, front/backtypes and421safe tests pass (1skip).

Studio evidence: /downloads/vireo-panel-seed-0701/screenshare-sheet.png and gameplay-sheet.png, exact0/6/11.7s. Both show modest centering change but duplicate the person because the source is inappropriate for screen/game roles. This is geometry validation, not a recommended layout or whole-layout quality success. Suitable game+camera source assignments still need their own footage and output review.
