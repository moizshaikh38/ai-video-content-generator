# VireoClip vs Top Platforms — Blind Clip-Quality Rating Protocol

**Status:** KIT READY — awaiting owner execution. This is E4b of `PLATFORM_QUALITY_ROADMAP.md`: the external-validity experiment that turns the audit's "unmeasured" verdicts into numbers.

---

## Purpose

Settle, with human ratings instead of marketing, whether VireoClip's clips are better than top AI clipping platforms on the four audited dimensions: **selection quality, boundary/timing integrity, caption quality, and overall shareability**.

## Sourcing (ToS-safe, explicit)

- Corpus: the 3 synthetic Phase-0 fixtures are too small — expand with **6–10 consented real sources** you own (your own podcast/streams/talks, or creator-permitted footage). Same sources must be processed on every platform.
- Competitor outputs: generated **manually on your own paid subscriptions** (OpusClip, Vizard are the documented leaders; add Riverside if licensed). No scraping, no automation, no ToS violations — this is a human manually using products they pay for and rating the outputs.
- Strip watermarks/branding where the platform's ToS forbids removal? **Do not strip** — rate as-delivered but note branding as a non-quality attribute to ignore; this study rates clip craft, not branding.

## Design

- **Blind**: clips renamed to neutral IDs (`A1, B1, C1…` per source×platform), source order and platform assignment randomized per rater (the prep script below prints a shuffled mapping the facilitator keeps sealed until scores are in).
- **Raters**: ≥2 (3 preferred). Not the person who ran the platforms, if avoidable.
- **Per clip, each rater scores 1–5** on: `selection` (is this moment worth clipping?), `completeness` (standalone thought, no mid-word/mid-thought cuts), `captions` (timing, readability, styling), `framing` (subject placement/stability), `overall` (would you post it?).
- Duration: ~10 min per rater per 10 clips per platform; budget ~1 hour total per rater.

## Statistics

- Primary: per-dimension **mean score per platform** with bootstrap 95% CIs; pairwise VireoClip-vs-best-competitor win rate per dimension with an exact binomial CI.
- Inter-rater: report Kendall's W (or per-pair Spearman). If W < 0.4, discuss divergences before publishing anything.
- Verdict rule (pre-registered): VireoClip "leads" a dimension only if the CI of the mean difference excludes 0 AND win rate ≥ 60%. Otherwise "parity" or "trails". **No dimension gets called without its interval.**

## Output

Fill `blind-rating-template.csv` (one row per rater×source×platform×clip), then compute the stats (any spreadsheet: means, CIs via bootstrap or t-based; or paste into the analysis script when one is added). File the filled CSV + summary next to this protocol, update `PLATFORM_QUALITY_AUDIT.md` §7 from "unmeasured" to measured with the numbers and CIs.

## Prep steps (facilitator)

1. Pick 6–10 consented sources; process each through VireoClip (full pipeline) and each competitor subscription; export each platform's top ~5 clips.
2. Rename files `<Source#>_<PlatformLetter><Clip#>.mp4` with a random letter→platform mapping (keep the key secret from raters).
3. Shuffle presentation order per rater; hand raters the CSV template + the scoring rubric below.
4. After all CSVs are in: unblind, aggregate, apply the pre-registered verdict rule, publish.

## Scoring rubric (1–5 anchors)

| Score | Selection | Completeness | Captions | Framing | Overall |
|---|---|---|---|---|---|
| 5 | I'd clip exactly this | Perfect standalone arc | Word-accurate, clean, readable | Subject always well-framed | Post immediately |
| 3 | Defensible moment | Minor rough start/end | Mostly synced, minor issues | Mostly framed, occasional drift | Needs a small edit |
| 1 | Why was this clipped? | Cut mid-thought/mid-word | Unusable | Subject lost | Would not post |
