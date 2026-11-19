# OpenRouter Parakeet English opt-in

The existing default remains `openai/whisper-large-v3-turbo`. Nothing in this checkpoint changes a production environment, subscription tier or entitlement.

Explicit opt-in: existing `TRANSCRIPTION_PROVIDER=openrouter` and `TRANSCRIPTION_MODEL=nvidia/parakeet-tdt-0.6b-v3`. The configured provider routes only an explicit `en` source-language choice to Parakeet. Hindi, Hinglish, auto and missing language continue using the existing OpenRouter Turbo baseline. The result records the model actually used. A direct Parakeet adapter call without explicit English refuses before network use. Do not activate without the remaining release qualification.

The Parakeet path uses the verified dedicated JSON STT contract with base64 audio, verbose JSON and both word/segment granularities. It keeps native word clocks, rejects missing/invalid/overlapping word clocks, and never stretches segment times into invented word timing. Missing detected language remains unknown. Actual provider-reported cost is optional evidence, not an estimated zero. Existing source receipt and chunk timing controls remain unchanged.

## Evidence

A single 5.23-second synthetic English fixture returned HTTP 200, matching spoken text, 14 word clocks, two segments and provider-reported cost $0.000087166841. An offline replay of that actual payload through this adapter preserved the 14 word clocks and the existing chunk merger's five-second source offset (millisecond rounding retained). This is endpoint, shape and clock-transport evidence, not a real-video accuracy, accent/noise, Hinglish or perceptual sync benchmark.

Nine new offline fixtures and 33 focused transcription/timing/quality tests pass under existing resource limits. Adapter-only strict TypeScript passes. Wider factory compilation still sees an existing Groq Buffer/Blob typing diagnostic. Wider source-binding tests emit passing assertions but do not exit within the 30-second guard; those runs are not suite passes. No limit was raised.

This Parakeet change does not activate tier routing, replace defaults, deploy, post live, add account scopes or copy competitor code. Later local tier-policy work and one separate actual MAI synthetic-English endpoint test are recorded in tier-transcription-policy.md. Same-audio Hindi-English quality/timing and full included-hours economics remain qualification gaps; the tier gate stays off.

References:
- https://openrouter.ai/nvidia/parakeet-tdt-0.6b-v3
- https://openrouter.ai/docs/api/api-reference/stt/create-transcription
- https://openrouter.ai/docs/guides/overview/multimodal/stt
