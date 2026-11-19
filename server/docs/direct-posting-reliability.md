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

## Posting history review feedback, November 19 at23:52 IST

User-visible local UI changes, not a release or a real platform result:

- Confirmed Instagram publication with incomplete/unverified caption or attachment details stays Published, review details, with a warning rather than a red Error/Failed label. It never offers a retry.
- Unknown dispatch/delivery is Delivery unconfirmed, not definitive Failed or Published. Pending processing says Awaiting confirmation and directs the user to refresh saved history, not upload the same clip again. No new polling or platform calls were introduced.
- Every history card displays the persisted selected platform account ID, requested visibility and available platform receipt. Requested is explicit: the UI does not claim that it rechecked the live audience. Missing legacy audience remains Not recorded. Account names are not invented from provider IDs or rediscovered from a first account.
- Viewing links require confirmed published status and a saved credential-free HTTPS URL. No link is invented from a media/container ID. Private confirmed posts without a public URL are explained. The display name is View post rather than View Live.
- Composer queue acknowledgement now says publication is not confirmed and points to Publishing & Scheduling. The failed-status filter is labelled Failed / unconfirmed because both records retain their existing backend status.

Twenty new helper/actual isolated React component checks plus28existing owner/readiness regressions pass together. A focused strict TypeScript check of the new helper/components/tests passes. Full history/composer dependency graph and mounted flows remain unqualified; exhausted broad TypeScript and Chromium launches were not retried.

Actual badge/details React components were server-rendered with fixture records and inspected as static pixels at390pxand desktop width using a lightweight renderer. All five inspected states show readable destination/audience/receipt text and full wrapped feedback. Unknown delivery has no retry, partial publication remains visibly published, and the definitive-failure fixture alone shows a retry-action indicator. This is an isolated visual fixture, not a screenshot of a mounted page or evidence that clicks, state transitions, responsive app chrome or live provider calls work. Fixed theme-color fallbacks were needed for the static renderer's unsupported CSS variables; full production theme fidelity is not claimed. Desktop and phone fixture images are retained outside product source. No published content, private account records or provider secrets were used.

Remaining independent posting work includes TikTok fresh creator options in composer, explicit Meta professional-account selection during OAuth discovery and resource-feasible mounted interaction qualification. App permissions/review and actual platform behavior still require separately authorized setup/testing. No account, permission, scope, quota, platform version, production setting or spending limit changed in this step.

## TikTok account-specific composer constraints, November19 at23:58 IST

Current official guidance corrects the earlier private-default assumption: the TikTok audience must be selected manually, with no default. The local TikTok composer now opens with a blank audience, unlike other platforms. A read-only owner-scoped creator-options endpoint checks the exact selected TikTok connection, actual existing video.publish grant, connection state and known expiry before decrypting a token or reading the provider. Upload-only connections remain blocked without any provider query, refresh, new grant or configuration change. Creator reads run once when opening/selecting an account or deliberately refreshing, not on each caption edit. Generation and connection checks discard stale responses. Failed/changed options clear the audience, consent and interactions, rather than silently keeping stale authority.

The component shows the returned nickname/username, exact current audience choices, maximum duration and selected clip duration. All returned official audience types, including friends/followers, retain their native values in the saved custom payload. Unknown/malformed creator values cannot enable submission. Interactions start unchecked; account-disabled interactions stay disabled and grey. Music consent is explicit. Fresh creator limits and any requested interaction are checked again before native init, without replacing the selected audience. The earlier absent-privacy native fallback was removed: missing audience or music consent now fails before creator query/init. Existing queued pending receipts are still resolved by status only, not resent. Legacy records missing these choices need new review, not an invented approval.

These controls are not a full TikTok compliance or usable-release claim. Commercial disclosure controls, in-composer rendered-content preview, developer app audit/eligibility, verified media-domain setup, mounted app acceptance and actual provider execution remain outstanding. Local UI explicitly warns not to use it for promotional posts; it does not silently infer a commercial-content decision. Existing generic account discovery and Meta selection remain separate work. No production configuration, OAuth scope, account connection, upload, post or paid call changed.

Qualification uses native TikTok fake-HTTP tests, the actual new service method with owner-scoped fixture database/token/provider dependencies, actual isolated React static markup, source-contract checks and prior posting/owner regressions. Focused provider/shared/component strict TypeScript passes, not the full service/controller/composer graph. The390pxstatic component image was visually inspected: fresh fixture nickname, maximum/selected duration, blank audience, unchecked interactions, grey disabled Duet and upload-only blocker are readable. It uses fixed theme fallbacks and is not a mounted interactive screenshot. The full app and production acceptance limits from previous checkpoints remain.

Sources inspected live:
- https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info
- https://developers.tiktok.com/doc/content-sharing-guidelines/

The creator endpoint documents20requests/minute/token. No automatic retry/polling was introduced. A deliberate refresh is a new user action; provider429/errors block options rather than infer availability. The endpoint itself makes no upload/init/status or scope-changing call.

## TikTok commercial disclosure and exact rendered review, November20 at00:03 IST

The existing modal, not a new website page, now includes disclosure and rendered-content review:

- Commercial disclosure starts off. Enabling it reveals Your brand and Branded content, with at least one category required. Own-brand shows Promotional content; third-party or both show Paid partnership. The music-use declaration adds the Branded Content Policy when appropriate, and changing disclosure/category clears consent. Native init receives the exact explicit brand_organic_toggle/brand_content_toggle flags, not a caption heuristic.
- Third-party promotion cannot silently broaden audience. It is disabled for Only me/followers-only; choosing a restricted audience is disabled while third-party disclosure is selected. The native validator also requires Everyone or Friends for that combination. Empty/inconsistent disclosure cannot be submitted.
- An authenticated owner/project/clip-scoped review read verifies ready state, gets the immutable selected storage identity, rereads the source record, then signs that exact object version. It neither uploads to TikTok nor changes a connection. No caller-supplied playback URL becomes a publish source.
- The modal presents that exact rendered output in a controlled, non-autoplay video element. Review confirmation is disabled until a video loaded-data event, and resets on changes to content, account, audience/interactions/disclosure, scheduling or the chosen render. The checked state is additionally bound to an exact decision key for the current content/account/schedule/creator-read/render selection, so an effect reset is not its only protection against changed inputs. The checkbox is an explicit user attestation, not proof that a human watched every frame.
- TikTok creation compares every reviewed selection identity field with a freshly selected immutable object before insertion. A replaced render, owner, project, revision, byte size, ETag or version is rejected rather than silently publishing a different output. Existing execute-time pinned media checks remain. Review URLs are not stored in posting payloads; the reviewed immutable selection is.

100focused fixture/regression checks pass after one test-only method-name typo was fixed and rerun. Three of these execute actual creation with fixture dependencies to reject missing/changed review and retain an exact unchanged selection. Shared/media/provider/components/tests focused strict TypeScript passes. This includes actual service-method execution with fixture owner/storage/signing dependencies, native fake-HTTP init flag checks, isolated React markup and existing owner/media/unknown-dispatch regressions. No storage or TikTok account was read or posted during these tests. This is not the full service/controller/modal dependency graph or mounted click/playback acceptance.

The390pxstatic React fixture was pixel-inspected: third-party/friends state shows Paid partnership and the changed unchecked declaration; Only me state greys third-party promotion and exposes missing-category feedback; exact-render review has a deliberately unloaded video and a disabled confirmation checkbox. No video playback or reviewed footage is claimed from this image. Static theme fallbacks and missing mounted/native-player behavior remain explicit. The actual signed-media load, modal state transitions, save/reopen/schedule behavior and real platform validation still need app acceptance before release. No production deployment, app grant, scope change, private upload or paid call occurred.

Official API fields and UX rules were rechecked at:
- https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- https://developers.tiktok.com/doc/content-sharing-guidelines/

This closes the local implementation gap, not the platform compliance/eligibility gap. Third-party disclosure/audience interpretation follows the guideline's Everyone/Friends limit conservatively, without switching a user's choice. App audit, actual domain verification, rights/music/commercial accuracy and any watermark restrictions remain distinct release checks. A user's checkbox is not a license or rights determination.
