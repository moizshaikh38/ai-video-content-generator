# Clean-clip implementation baseline, 18 Nov 2026 IST

Approved full-plan implementation starts after the owner's 00:34:53 IST instruction. Restrictions remain: no new spend, account/auth changes, remote backup authentication changes, main merge or deployment; no heavy 4K until resource isolation.

Checkpoint before baseline work: ba55705. Missing historical launch asset remains unrecovered. Tests now accept explicit VIREO_QUALIFICATION_MEDIA, retaining the original path as fallback rather than silently substituting media. Alternate: rank1-clean-source-approx-aligned.mp4, 28.462s, 854x480 H264 plus stereo44100AAC, SHA256 77077a07ad64772757648b96a98f4ed05b0beaf50df231fabd767dd768a2d70d. This substitution is infrastructure/audio testing, not proof about the missing launch video or transcript accuracy.

Isolated Mongo database vireo_cleanclip_baseline_20261118 on existing loopback27019. No production DB. Provider keys cleared for runs. Supabase mocked only within existing tests and configured with local dummy URL/key; production auth source unchanged.

Findings:
- Hook regeneration three real HTTP/localMongo cases pass under proper isolated configuration, including provider-unavailable and unknown clip. Earlier cancellations were not a current runtime outcome.
- Audio extraction/analysis/enhancement suites exercise real alternate media successfully.
- Audio graph allocated sidechain split outputs before applying the asset allowlist. A disallowed but existing secondary file was skipped later, leaving an unconnected asplit pad and FFmpeg failure. Fix: use the same security predicate in duck-count allocation. Denied inputs remain denied, not made legal to satisfy tests. Two new graph regression tests pass, including mixed denied/allowed sources.
- Explicit alternate at /downloads is correctly denied as a secondary compiler input. A test-owned copy under /tmp is allowed and tests the intended sidechain path.
- Latest focused audio/guard run:38passed1failed. Remaining actual2.5s composed render finishes but output has no audio stream, despite graph audio map. It includes legacy one-pass loudnorm plus sidechain and a2.6s input bound. Needs isolated audio-graph/delay investigation, not a claimed successful audio E2E. Output and graph preserved under /downloads/vireo-cleanclip-baseline/audio-current.mp4 and .graph.json.
- Broader configured run before allowlist fix47passed2failed21cancelled. HookLab21cancellations are setup failure: content-pack generation attempts unavailable AI provider with no key. Must mock its external dependency explicitly before calling this reproducible.

Evidence logs under /downloads/vireo-cleanclip-baseline. No all-green claim. No production, paid-provider, full4K or untouched output claim.
