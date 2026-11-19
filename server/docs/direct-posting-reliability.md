# Direct posting reliability checkpoint

Local implementation, 19 November 2026. Not deployed or activated against user accounts.

## Implemented
- TikTok Direct Post submission returns pending, not published. A durable job receipt allows status-only reconciliation after a fresh worker instance; no second upload is authorized by pending, status timeout, restart or ambiguous dispatch.
- Status checks are spaced by 60 seconds and stop for review after 24 hours without confirmation. PUBLISH_COMPLETE is required for final success. Private posts may lack a public ID; the receipt is labelled as such, not replaced by a fake video ID or URL.
- Absent TikTok privacy defaults private. Explicit public is retained only if current creator information supports it. Unsupported/unlisted choices fail closed. Creator maximum duration is checked before submission. Interactions remain disabled rather than enabling comments/duets/stitches by inference.
- Existing video.publish scope is checked at preview, creation and execution. This patch does NOT request a new OAuth scope or change account configuration. The current OAuth adapter still requests video.upload, so a normally connected upload-only account remains blocked for direct posting until separately authorized setup is completed.
- Instagram uses only the persisted selected account ID, verifies it, and never rediscovers the first Meta page as a replacement. Private/unlisted/implicit visibility is refused. Numeric media IDs are no longer turned into invented Instagram shortcode URLs.
- Composer defaults private and resets private when reopening or selecting a different account. TikTok and Instagram visibility is now visible. Instagram requires an explicit public/account-audience choice. Stale preview responses cannot overwrite newer input validation.
- Existing exact media selection, owner/account binding, transactional job creation, fingerprint deduplication and unknown-dispatch guards remain.

## Qualification
- 20 native provider fixture tests passed, with global fetch replaced and no live network.
- One opt-in actual isolated loopback Mongo integration passed: one submission despite pending, status error and a fresh service instance; actual completion, scope failure, account rebinding, definitive rejection, expiry and unknown-dispatch retry refusal checked. Provider calls were fixtures, not real social posting.
- 521 offline checks passed, including existing owner, media binding and dispatch tests. Their source-extraction harness was updated to include the new outcome helper methods; no assertions removed.
- Focused strict TypeScript passed for provider code and native provider tests.
- Full frontend TypeScript at the existing 192 MiB heap limit exhausted the heap. No raised-cap retry. Full backend TypeScript remains unqualified from earlier bounded OOM.
- Desktop composer and narrow 390 px default layout were rendered and visually inspected. A later interaction fixture failed because viewport mobile emulation reloaded the component before the selected-account assertion. Its initial resource accounting also missed Chromium descendants. After correcting descendant accounting, the guarded browser launch exceeded the 384 MiB cap and was stopped. No raised-cap retry. Therefore full mounted interaction qualification is NOT passed. Changes are backed up for continued qualification, not released.

## Remaining
- Full mounted UI privacy/account flow verification within available resources.
- Current TikTok creator options must be displayed using fresh creator-info in the export UI before production compliance can be claimed. This patch verifies them at execution but does not claim full developer UX review compliance.
- Existing Instagram API version, token handling and async-container recovery still require further audit. This patch fixes selected destination and false links, not all platform behavior.
- Developer app setup/review, account eligibility, granted permissions, verified TikTok media domains, actual provider response behavior and real-account end-to-end publishing remain unverified. No content was published, account connected, permission added or default production provider changed.
- PeakCut and Supoclip comparisons were code inspection only. This checkpoint does not establish overall superiority or real-world posting reliability over either.

Sources: TikTok status and creator APIs:
https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status
https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info
