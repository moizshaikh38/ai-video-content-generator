# Transcript review recovery, 18 Nov 2026

Development only. Persist the source/quality-review failure code through asynchronous failed jobs and frontend row mapping. Home restores and polls flagged projects into review, not generic generation retry. Immediate analysis/processing failures use the same classifier. Legacy needs_review without a code fails closed. Review navigation and source replacement remain available; neither approves text. The generation handler also refuses the review state.

Project details hide/guard processing retry, expose stored flagged text without promotion, and offer source playback when the existing signed preview endpoint succeeds. Missing playback is explicitly unverified. There is intentionally no approve-transcript or paid retranscription button: a separate source/credit decision path remains to be designed.

Qualification: four classifier tests; frontend/server typechecks. Actual Home component under test-only session and intercepted API fixture: exact source-review code and legacy review flag restored; desktop1280 and phone390 pixels inspected; no Retry Generation, no horizontal overflow. Open Project navigates into actual ProjectDetailPage, shows flagged fixture transcript and no Retry Processing; zero non-estimate API mutations observed. Requests outside loopback blocked. No provider, production data, live auth or storage proof. Signed source playback branch is not exercised with real media by this recovery test. Artifacts /downloads/vireo-transcript-recovery including result.json and screenshots. UI runner fixture is separate from product and not deployed.

This closes basic interactive review surfacing, not legacy migration/retranscription, transcript accuracy, ordinary source-bound selection/export or general E1 completion.
