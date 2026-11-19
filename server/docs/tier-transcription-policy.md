# Tier-aware transcription, disabled release gate

The local Free=Whisper Turbo / paid=MAI direction is implemented behind `VIREO_TIERED_TRANSCRIPTION=1`. This flag defaults off. No environment, live routing, plan prices, entitlements, quotas or customer account was changed.

When enabled after qualification:

- The existing video-processing path resolves the authenticated owner's canonical server entitlement. It does not accept a client-supplied paid flag.
- Free and developer/testing entitlements choose `openai/whisper-large-v3-turbo`. Creator, Pro and Studio choose `microsoft/mai-transcribe-2`. Unlimited developer status is not evidence of paid subscription.
- Before sending audio, the policy is frozen with a majority-write compare-and-set on that owner's existing credit reservation and processing attempt. Concurrent workers read the winning snapshot. Later plan changes do not silently change a retry's model. Missing/corrupt reservations require review before transmission.
- MAI uses the documented OpenRouter JSON STT route, verbose JSON, native word/segment timestamps, explicit verbatim style and automatic language detection. The source-language preference is recorded separately, not passed as a forced single language, so Hindi-English code switching is not suppressed by a language hint. Missing detected language remains unknown.
- MAI errors do not silently route to Turbo or a separate provider. Invalid/missing native word clocks require review rather than invented captions. Whole-file automatic retries after chunk failures are disabled for this tier policy, including through the input observer.
- Existing source/word timing and reuse checks remain in place. An existing reusable transcript is checked before tier selection, so an upgrade does not itself trigger a paid re-transcription. The actual selected model/policy and known provider cost are stored with the result. Chunk cost sums are exposed only when every chunk returned billing evidence; missing cost is unknown, not free.

The independent Parakeet explicit-English implementation remains available through the existing non-tier configuration. Turning on tier mode takes precedence over the global model and gaming-review override for this path. That is local staged behavior, not approval to turn it on. Other transcription entry points are not claimed tier-aware until audited.

## Qualification

41 focused offline tests pass, including eight new tier-policy fixtures. A separate enabled isolated local Mongo test passes for owner binding, concurrent selection, persistent snapshot reuse and retaining other reservation metadata. Focused policy/adapter strict TypeScript passes with the repository's existing ffprobe declaration included. No provider network is used by these tests.

MAI endpoint execution and same-audio Hinglish accuracy/word-alignment are still untested. The earlier single Parakeet synthetic call is not a MAI test. No quality win is claimed. Full application and deployed pipeline qualification remain incomplete. Keep the gate off until this evidence is obtained within the approved spend limit and rollout is authorized.

## Economics checked November 19, 2026

OpenRouter lists MAI at $0.10/audio hour. Its Turbo model catalog's starting rate was $0.00000333/second, about $0.011988/hour; provider charges can differ and STT does not honor order/only/ignore pinning. At the current local source-minute plan definitions, one pass at full usage would cost about $0.003 for Free Turbo (15 minutes), or $0.20/$0.60/$1.50 for MAI at Creator/Pro/Studio's 120/360/900 minutes. These are ASR-only estimates, not verified deployed plan offers or profit calculations. Rendering, analysis, storage, bandwidth, chunk overlap, retries, payment fees/taxes and support are additional.

Sources:
- https://openrouter.ai/microsoft/mai-transcribe-2
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-transcribe
- https://openrouter.ai/openai/whisper-large-v3-turbo
- https://openrouter.ai/api/v1/models?output_modalities=transcription
- https://openrouter.ai/docs/guides/overview/multimodal/stt
