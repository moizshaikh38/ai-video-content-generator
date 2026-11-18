# Combined local source / preview / export qualification

## Scope and boundaries

Local-only reversible qualification. No provider calls, spend, push, deployment or account migration. Source: `/downloads/rank1-clean-source-approx-aligned.mp4`, SHA256 `77077a07ad64772757648b96a98f4ed05b0beaf50df231fabd767dd768a2d70d`. Uses unchanged saved actual provider transcript and a manually selected 0-6 second candidate. Captions disabled for this composition test. No transcript accuracy, speaker identity, Auto editorial selection or generalization claim.

Actual components: Mongo persistence, source download/hash/object receipt checks, normal SmartReframe analyzer with existing local YuNet/NanoDet models, normal preview controller served over local HTTP, EditorShell fetching that controller/source, normal render job and multi-track Pro graph, upload and signed download retrieval. Authentication identity injection, entitlements, watermark decision, encoder selection and local S3-protocol object storage are explicit test doubles. Browser does not exercise production sign-in, save or export dialog. Test driver invokes render after preview checks. This is a combined local component workflow, not live-account production E2E.

`SMART_REFRAME_SHOT_COMPOSITION=1` is explicitly enabled only in this qualification. The initial default-flag attempt correctly returned no adaptive envelope; do not call the feature enabled by default. Initial browser network-idle wait was inappropriate with media streaming; runner uses DOM/media readiness and proper source Range responses. A playback test initially waited for the source video's native ended event, but editor stops at the candidate boundary before the 28.444 second source ends. Final test waits for candidate playback pause with advancing decoded frame evidence.

## Fresh measured result

Final directory `/downloads/vireo-combined-playback-0427` and corresponding `.log`. Normal analyzer ran fresh for six seconds of source, 26 samples, two detected tracks, score .329, cut at 3.269933. These are analyzer observations, not validated identity/recognition accuracy. Both composition windows are review-marked 4:3 Fit context. Browser fetched three normal controller responses with HTTP200; no page exceptions. Timeline ruler clicks, not direct source-time writes, exercise paused editor seek. Actual playback records 177 decoded callbacks from 0 through 5.972633 seconds, group-to-fit UI switch first observed at 3.3033 seconds for the 3.269933 analysis cut. Largest observed callback gap .1001 seconds; do not claim zero drops or flawless temporal quality. Mirrors use the same decoded source clock. Saved editor database document stays byte-equivalent before/after rendering.

Render result: ready/completed, one actual render MP4 uploaded and signed URL downloaded, H264/AAC 720x1280, six seconds. Source is 854x480 and resolution service correctly warns of interpolation, not native 720 portrait detail. Local object service is cleaned up, along with only the run's random-owner rows. No provider calls.

## Backdrop color gap and bounded improvement

The main reviewer flagged a visible preview/export blur-treatment difference. The previous RGB diagonal .95/-0.125 transfer made midtones too light. Decoded FFmpeg color-patch experiments show the existing limited-range YUV eq chain changes luma while preserving chroma. Preview now uses an approximate sRGB luma-preserving matrix with additive -0.17 offset. Eight recorded midtone patch outputs match within three RGB levels in the focused test. Existing manual crop/panels/user-layout precedence and saved settings are not rewritten. Export renderer itself is unchanged.

Inspected final before/current/export triples at0and4seconds. Current backdrop darkness/color is closer, especially gray boat foreground/background; blur shape, edge handling and color remain approximate, not pixel parity. Earlier before/after screenshot diagnostic outside the sharp band reduced RGB MAE from7.22to2.12at0seconds and7.35to1.65at2seconds; these measurements involve resized screenshots and temporal/render sampling, not a fidelity acceptance threshold. At4seconds browser seek decodes the preceding source frame near3.9667while exported4s matches source4s; this explains part of the residual image difference and is not a new proof of output drift. No claim of full presentation parity or motion/listening approval.

## Checks

Focused blur/identity/preview tests25/25. Frontend/server TypeScript checks pass. Production Vite bundle passes with existing large-chunk warning. Broader explicit safe suite last ran before this change421pass/0fail/1skipof422; do not label the whole repository or all output quality green. Existing independent reference, default Compact font, listening/audio finishing, Auto no-rescue holdouts, legacy recovery and full4K gaps remain open.
