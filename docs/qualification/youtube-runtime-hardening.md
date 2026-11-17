# YouTube ingestion runtime and failure handling, 2026-11-17

This change does NOT repair the original acceptance video import.

Original acceptance target: https://www.youtube.com/watch?v=7RaC2nKBqv4 , captions OFF, Auto Layout test. Current Vireo UrlIngestionService attempted its existing three strategies and received verification/bot challenges before source bytes. A separate Python environment with matching yt-dlp[default]2026.10.21 dependencies and explicit Node22 runtime still returned the same challenge once. No repeated source polling. No clips or generation/credit reservation created. Browser watch availability is not a downloadable-source guarantee.

Bounded hardening:
- Enable the server's installed Node>=22 explicitly for yt-dlp and prohibit automatic remote script components. Matching EJS remains an installation dependency.
- Request yt-dlp's default/EJS dependency group in fresh Python installations. Python3.10 cannot install current2026.10.26, which requires3.11. Existing legacy-binary early-return remains a known setup limitation, not claimed repaired.
- Stop extractor/strategy retries after verification or rate-limit responses instead of probing more clients against an explicit refusal.
- User-facing failure no longer prescribes exporting account cookies or automatic timed retries. Direct file/direct downloadable copy is the immediate supported fallback.

No server auth/session changes, cookie extraction, proxies, paid infrastructure, deployment, or successful-source claim. Requirements/runtime maintenance does not authenticate an import. Actual ingestion, clip rendering, and user delivery remain pending source availability. No change to caption or Auto Layout policy.

43 focused offline tests pass across runtime/classification/URL-ingestion tests; server TypeScript clean, setup script syntax and diff checks clean. These tests establish deterministic error/runtime behavior, not live download success.

References checked:
- https://github.com/yt-dlp/yt-dlp/wiki/EJS
- https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- https://github.com/yt-dlp/yt-dlp/releases/latest
