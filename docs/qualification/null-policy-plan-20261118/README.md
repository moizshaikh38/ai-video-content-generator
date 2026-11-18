# Optional null policy matches absent source-plan configuration

A broader focused regression sweep first found one stale test that still expected null policy rejection after the earlier upload compatibility fix. Corrected that test while retaining rejection of non-null invalid policies.

Investigation then found a distinct real editor mismatch: itemPlanConfigurationKey serialized null while plan options could serialize absent. A new preview test failed before the fix. Shared plan options and preview configuration key now treat null as absent. Null/absent preview equals the actual normal Pro measured plan, including fingerprint, while manual/source/config checks remain intact.

Fresh fixture persisted layoutPolicy:null in Mongo; real normal analyzer/controller and actual EditorShell Auto -> Three -> Four completed, actual save/get/direct compile completed. Screenshot pixels inspected: Auto: Four displays four different people. Source/frame quality caveats and explicit offline face-review gate remain unchanged from manual-four qualification. This is not production or full-upload proof for participant layouts.

118 focused tests passed after fix, frontend/backend TypeScript checks clean. No paid calls or default review activation.

## Automatic/manual label correction

Actual UI pixels also exposed an ownership-label mistake: automatic measured panels were included in the Manual framing takes priority test. Changed that condition to manualPanels, not activePanels. A fresh actual UI run verifies Auto has no manual-priority message, while selecting explicit Four displays it. Both screenshots inspected. Review side context warning remains. This changes the label only, not crops or authority.
