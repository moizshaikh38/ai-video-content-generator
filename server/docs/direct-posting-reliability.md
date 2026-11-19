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


## Instagram follow-up, 23:13 local checkpoint

Local code only. The historical findings above are not a deployment claim.

- Reviewed Meta's version lifecycle, v26 changelog, Facebook Login getting-started and media-publish contracts. Both OAuth and publishing now share v26.0 in code. v19 expired May 21, 2026. Some current guide examples use v27 while the official lifecycle table lists v26; no automatic v27 jump was inferred. The flow still uses the original Facebook Login permissions and objects, not a switch to Instagram Login or new scopes. Commerce, ads and the removed legacy protocol/Page fields are not used by this flow. Real app/version compatibility still needs qualification.
- Initial publishing creates a container, returns pending, and saves its account-bound receipt before a later worker may publish it. Status checks are one minute apart. Automatic follow-up stops for review after five minutes. It does not leave an in-memory 3-second polling loop running.
- A ready container requires a majority-written irreversible dispatch marker before one media_publish call. Another worker, transport failure, restart, malformed success payload or uncertain response cannot authorize another media_publish or container upload. The marker is monotonic: a concurrent stale IN_PROGRESS result cannot erase it. A crash after the marker but before the request may require manual review rather than safe-looking automatic retry. This favors no duplicates over falsely promising recovery.
- PUBLISHED confirms publication, but without a returned media ID the stored receipt remains explicitly a container receipt, not an invented media ID or URL. ERROR/EXPIRED are distinct from pending. Unknown status is not success. An uncertain dispatch that still reports FINISHED is only read, never resubmitted.
- Known partial successes remain published, not failed/retryable. Caption/attachment issues and unknown attachment verification retain review evidence and a fixed warning in the history API's existing feedback field. No automatic repost is triggered. Full UI presentation of these warnings remains unverified; the existing history component labels that field as an error, so better warning styling is a remaining UX item.
- Meta account discovery no longer picks the first of multiple accounts or silently binds a basic Facebook user ID as an Instagram account. Multiple/paginated/missing professional-account results require an explicit selection. A complete multi-account selection UI is still owed.
- Requested OAuth permissions are not claimed granted. The adapter reads actual granted permission statuses and treats missing/incomplete evidence as unverified. Refresh results persist current scopes. Missing expiry is unknown rather than an invented 60-day value. Account/status reads use bearer headers rather than token query URLs, reject redirects and have bounded timeouts. No live authorization or scopes were changed.

Qualification: 32 native Instagram/TikTok/OAuth fixtures pass; one enabled real isolated local Mongo Instagram integration passes with native provider logic but fake HTTP/media URL, covering restart, lost response, partial success, five-minute horizon, two simultaneous FINISHED workers, monotonic checkpoint and removed-permission persistence. The earlier TikTok real-Mongo fixture still passes. 28 owner/readiness contracts and 521 offline checks pass. Focused Instagram provider/OAuth strict TypeScript passes. No real social account, app permission, external upload or post was used. Full backend/frontend/mounted UI restrictions above still apply. This is backed-up progress, not a verified release or competitor superiority claim.

Further current official sources:
- https://developers.facebook.com/docs/graph-api/changelog/versions/
- https://developers.facebook.com/docs/graph-api/changelog/version26.0/
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/get-started
- https://developers.facebook.com/documentation/instagram-platform/content-publishing/
- https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media_publish
- https://developers.facebook.com/docs/graph-api/reference/user/permissions/

Meta's current publishing guide and reference disagree on the numerical daily cap (50 versus 100). No hardcoded cap or unsupported availability claim was introduced. A future preflight should read actual account quota/config rather than pick one number.

## Dynamic Instagram publishing-capacity check, November 19 at 23:39 IST

Immediately before the first irreversible `media_publish` checkpoint, the native provider reads the exact selected account's `content_publishing_limit?fields=quota_usage,config` using the existing bearer token. It accepts only one response row with nonnegative integer usage, positive integer ceiling and positive integer window duration. It does not hardcode the contradictory 50/100-post documentation values or turn missing/coerced data into spare capacity.

If usage reaches the account-returned ceiling, the same saved container remains pending without a publish checkpoint or dispatch. The existing one-minute/five-minute reconciliation bounds remain. Capacity can reopen on a later read, without creating another container. Missing/malformed capacity cannot authorize dispatch. A previously started uncertain dispatch remains read-only and does not make a new quota read. The snapshot is retained with the checkpoint/result metadata. This check is not a reservation: another app or concurrent job can use capacity after the read, and Meta still enforces its final limit.

34 native-provider/OAuth fixtures pass, including dynamic exhaustion and malformed-capacity cases. The enabled isolated real-Mongo recovery test passes with quota exhausted then reopened on the same receipt, plus prior restart/lost-response/partial-success/expiry/concurrent-worker cases. Social HTTP responses and media URL are fixtures; no real social call or post occurred. Focused provider strict TypeScript passes under the existing resource bounds. Full mounted UI, live app/permissions and actual platform execution remain unverified. No API-version, scope, account or deployed setting changed for this check.

Official sources inspected:
- https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit
- https://developers.facebook.com/documentation/instagram-platform/content-publishing/

The reference field table defines `config`, while its example request asks for an undefined `rate_limit_settings` field. The implementation follows the field table and example response with `config`, and fails closed if the actual supported API does not return it. This discrepancy still needs an authorized live-contract check before release, not an automatic field fallback or version bump.
