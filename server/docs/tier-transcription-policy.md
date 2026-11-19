# Tier-aware transcription, disabled release gate

The local Free=Whisper Turbo / paid=MAI direction is implemented behind `VIREO_TIERED_TRANSCRIPTION=1`. This flag defaults off. No environment, live routing, plan prices, entitlements, quotas or customer account was changed.

When enabled after qualification:

- The existing video-processing path resolves the authenticated owner's canonical server entitlement. It does not accept a client-supplied paid flag.
- Free and developer/testing entitlements choose `openai/whisper-large-v3-turbo`. Creator, Pro and Studio choose `microsoft/mai-transcribe-2`. Unlimited developer status is not evidence of paid subscription.
- Before sending audio, the policy is frozen with a majority-write compare-and-set on that owner's existing credit reservation and processing attempt. Concurrent workers read the winning snapshot. Later plan changes do not silently change a retry's model. Missing/corrupt reservations require review before transmission.
- MAI uses the documented OpenRouter JSON STT route, verbose JSON, native word/segment timestamps, explicit verbatim style and automatic language detection. The source-language preference is recorded separately, not passed as a forced single language, so Hindi-English code switching is not suppressed by a language hint. Missing detected language remains unknown.
- MAI errors do not silently route to Turbo or a separate provider. Invalid/missing native word clocks require review rather than invented captions. Whole-file automatic retries after chunk failures are disabled for this tier policy, including through the input observer.
- Existing source/word timing and reuse checks remain in place. An existing reusable transcript is checked before tier selection, so an upgrade does not itself trigger a paid re-transcription. The actual selected model/policy and known provider cost are stored with the result. Chunk cost sums are exposed only when every chunk returned billing evidence; missing cost is unknown, not free.

The independent Parakeet explicit-English implementation remains available through the existing non-tier configuration. Turning on tier mode takes precedence over the global model and gaming-review override for this path. That is local staged behavior, not approval to turn it on. The intelligence fallback and legacy standalone transcription helper now refuse new audio requests when tier mode is on, because they have no owner-bound processing reservation. Intelligence can still reuse its source-verified cache or a supplied transcript. Content Studio can fall back to its existing transcript-only behavior; this does not claim complete tier-enabled multimodal coverage. These paths must be connected to the canonical pipeline before full feature parity is claimed.

## Qualification

41 focused offline tests pass, including eight new tier-policy fixtures. A separate enabled isolated local Mongo test passes for owner binding, concurrent selection, persistent snapshot reuse and retaining other reservation metadata. Focused policy/adapter strict TypeScript passes with the repository's existing ffprobe declaration included. No provider network is used by these tests.

MAI endpoint execution now has one actual synthetic-English call through this adapter, described below. A later paired public-corpus lexical check is described below. Independent human word-alignment and rendered caption sync remain untested. No general quality win is claimed. Full application and deployed pipeline qualification remain incomplete. Keep the gate off until this evidence is obtained within the approved spend limit and rollout is authorized.

## Economics checked November 19, 2026

OpenRouter lists MAI at $0.10/audio hour. Its Turbo model catalog's starting rate was $0.00000333/second, about $0.011988/hour; provider charges can differ and STT does not honor order/only/ignore pinning. At the current local source-minute plan definitions, one pass at full usage would cost about $0.003 for Free Turbo (15 minutes), or $0.20/$0.60/$1.50 for MAI at Creator/Pro/Studio's 120/360/900 minutes. These are ASR-only estimates, not verified deployed plan offers or profit calculations. Rendering, analysis, storage, bandwidth, chunk overlap, retries, payment fees/taxes and support are additional.

Sources:
- https://openrouter.ai/microsoft/mai-transcribe-2
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-transcribe
- https://openrouter.ai/openai/whisper-large-v3-turbo
- https://openrouter.ai/api/v1/models?output_modalities=transcription
- https://openrouter.ai/docs/guides/overview/multimodal/stt

## Standalone-path audit

Two additional fixtures check that the legacy helper makes zero requests in tier mode and that the intelligence policy guard precedes extraction outside the old catch-and-continue block. The latter is a source-order contract. A separate actual intelligence-service test with fixture repositories/probe/audio-features confirms the policy error is propagated and recorded as failure, with zero provider calls and no completion. This is not full mounted intelligence execution. The policy and legacy helper strict typecheck passes; the expanded intelligence dependency-graph check hit the existing 192 MiB heap limit, so that check is not a pass. The gate remains off.

## Actual MAI endpoint checkpoint, November 19 at 23:26 IST

One actual request through the final adapter used the same 5.23-second synthetic English WAV as the Parakeet probe. The response was HTTP 200 with matching spoken text, 14 native word clocks, one segment, detected English and no adapter timing issues. An offline replay of that actual response through the adapter and chunk merger preserved all 14 word texts/clocks at a five-second source offset, within existing millisecond rounding. There were no additional paid calls for replay.

The provider billed six audio seconds and reported $0.00016666666666666666. Short requests can therefore cost more than exact-duration arithmetic. Cumulative spend was checked against the original $0.20 total approval; the conservative ledger includes possible double-counting of delayed prior usage rather than an assumed refund. This establishes request/response and timestamp transport only. It does not establish real-video quality, code-switching accuracy, speaker handling, independently reviewed word boundaries, or perceptual subtitle sync. The tier gate remains off.

Before a quality comparison, use the identical authorized natural Hindi-English recording for Turbo and MAI, lock its hash and independently review the reference transcript/word boundaries before seeing provider hypotheses. Keep code switches, proper names, numbers, silence/noise and language/script policy explicit. Report WER with its reference/tokenization policy, native timing coverage, boundary error on eligible matching words, costs and uncorrected failures. Do not substitute this synthetic English endpoint test or a provider benchmark claim for that evidence.


## Public-corpus lexical check and observed word-list defect

Three previously frozen MUCS blind-test segments, 27.01 seconds per model, were each sent once to the existing OpenRouter adapter for MAI and Turbo. Two are Hinglish tutorials, one a 2.01-second Hindi-only control. No retry or active-tier change.

Scoring was frozen before responses: NFC, casefold, punctuation replaced by spaces, whitespace tokenization, retaining script and spelling. Against the 56 corpus tokens, MAI had 7 edit errors and Turbo 22. Case counts were 0/19 versus 8/19, 0/5 versus 1/5, and 7/32 versus 13/32. These are strict corpus-label differences, not semantic error rates or a general accuracy claim. Script/spelling, nasal marks, compound splitting, email formatting, inflection and possible corpus-label errors contribute. The repack/original equivalence and independent human sample review remain unverified. No provider clocks are treated as a human reference.

Actual Turbo native word lists included extra tail tokens absent from transcript text: five in the first case and nine in the third. Existing timing normalization rejected three/eight zero-duration entries, but two/one positive-duration tail entries survived. Text-only lexical scoring does not measure these extra caption candidates.

The local correction rejects transcript/native-word coverage disagreement for audio review. It compares exact speech character sequence after ignoring case, canonical Unicode form, punctuation and spacing, allowing subword/email segmentation without rewriting speech. It does not deduplicate repeats, choose between conflicting renditions, fix text or invent clocks. Every repeated occurrence must still agree. This is a consistency check, not proof of speech accuracy.

Checks run on both native payload and normalized words in the OpenRouter adapter, legacy/cached transcript usability, and the actual word-caption extractor. The explicit review error cannot trigger provider failover or a whole-file transcription retry. Processing records preserve the review status; caption extension cannot swallow it as an ordinary saved-cue fallback. Invalid-clock handling retains its prior error priority.

The six exact captured responses were replayed offline. The two problematic Turbo cases reject; all three MAI cases and the Hindi Turbo control retain their original native clocks and words. Direct caption extraction and cached-record rejection were checked, including the extra tail after removing zero-duration entries. Synthetic legitimate repeated-speech and subword cases remain accepted. This does not prove moving-video synchronization, full application behavior, real-account posting or production readiness. Gate remains off.

Sources:
- https://openslr.org/104
- https://huggingface.co/datasets/dianavdavidson/mucs-hinglish-blindtest
- https://openrouter.ai/microsoft/mai-transcribe-2
- https://openrouter.ai/openai/whisper-large-v3-turbo
