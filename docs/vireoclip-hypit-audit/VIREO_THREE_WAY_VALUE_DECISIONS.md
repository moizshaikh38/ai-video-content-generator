# VireoClip: Three-Way Strategic Value & Feature Decisions

> **Document ID:** `VIREO_THREE_WAY_VALUE_DECISIONS.md`  
> **Target System:** VireoClip Video Creation Platform  
> **Comparative Sources:** Hypit (Project B) & OpenShorts (Project C)  
> **Auditor Role:** Principal Software Architect & Product Strategist  
> **Date:** October 2026  

---

## 1. Decision Framework & Product Criteria

Every candidate capability from Hypit and OpenShorts is evaluated through five rigorous product lenses:
1. **User Problem & Retention Impact:** Does it measurably improve clip quality, production speed, or user retention?
2. **Current Baseline Sufficiency:** Does VireoClip already solve this problem adequately?
3. **Licensing & Legal Viability:** Can it be incorporated into a commercial multi-tenant SaaS without IP risk?
4. **Operating Unit Economics:** Does it preserve VireoClip's low per-clip marginal cost ($0.003–$0.012), or does it introduce expensive GPU/API overhead?
5. **Architectural Coherence:** Can it be added incrementally without rewriting proven FFmpeg and React systems?

### Decision Classifications:
* **ADOPT:** High-value, legally permissible capability incorporated directly or ported from MIT code.
* **ADAPT:** Valuable capability requiring a VireoClip-specific architectural design.
* **BUILD NATIVE:** Implement the abstract concept independently via Clean-Room protocol (no code copied).
* **INTEGRATE:** Connect via standard commercial API or compatible dependency.
* **DEFER:** Valuable, but non-essential for the current product stage.
* **REJECT:** Unviable due to licensing restrictions, prohibitive compute costs, or strategic misalignment.
* **INVESTIGATE:** Insufficient empirical evidence to warrant immediate commitment.

---

## 2. Master Decision Matrix

| # | Feature / Capability | Source Project | Decision | Why VireoClip Needs or Does Not Need It | User Impact | Effort | Running Cost | Confidence |
| :-: | :--- | :--- | :---: | :--- | :---: | :---: | :---: | :---: |
| **1** | **Empirical 4+ Clip Retention Floor** | OpenShorts (`clip_selection.py`) | **ADOPT** | Prod metrics prove returning $\ge 4$ clips increases day-2 return rate from 0.4% to 16.1%. Prevents LLM collapsing to 1 clip. | **High** | **XS** | $0.00 | **High** |
| **2** | **Word-Boundary Snapping (`snap_clip_to_words`)** | OpenShorts (`clip_selection.py`) | **ADOPT** | Snaps AI cuts to Whisper word boundaries with 0.35s lead / 0.45s tail silence. Eliminates chopped words at clip edges. | **High** | **S** | $0.00 | **High** |
| **3** | **12-Frame Gemini Layout Picker** | OpenShorts (`layout_picker.py`) | **ADAPT** | Sends 12 frames at 1024px to Gemini Flash-Lite ($0.0003 cost) for 96% accurate closed-choice layout selection (none/split/screencast). | **High** | **S** | +$0.0003/vid | **High** |
| **4** | **Pre-Existing Burned Subtitle Detection** | OpenShorts (`burned_subtitles.py`) | **ADAPT** | Detects bottom-band hardcoded subtitles in TV/TikTok uploads and auto-crops before reframing. Prevents double-text collision. | **Med** | **S** | $0.00 | **High** |
| **5** | **Face-Avoiding Hook Text Placement** | OpenShorts (`hook_placement.py`) | **ADAPT** | Analyzes 6 frames to find vertical spot with minimum face overlap within safe zone (6%-80%). Prevents covering eyes or speakers. | **High** | **S** | $0.00 | **High** |
| **6** | **Visually Grounded Hook Rewriting** | OpenShorts (`hook_grounding.py`) | **ADAPT** | In tutorials, rewrites transcript hooks using 3 sampled screen frames so hook describes what is shown on screen. | **Med** | **S** | +$0.0001/vid | **High** |
| **7** | **Split-Seam Caption Placement (`{\an5}`)** | OpenShorts (`split_layout.py`) | **ADOPT** | In stacked two-speaker layouts, positions ASS subtitles on the horizontal seam between halves, keeping both faces unobstructed. | **High** | **XS** | $0.00 | **High** |
| **8** | **Screencast & Loom Inset Layouts** | OpenShorts (`screencast_layout.py`, `camera_inset.py`) | **BUILD NATIVE** | Auto-detects screen recording reading area + enlarges corner webcam bubble. Critical for software demos and tutorial creators. | **High** | **M** | $0.00 | **High** |
| **9** | **Word-Anchored Semantic Timeline** | Hypit (`<semantic:Projection>`) | **BUILD NATIVE** | Binds B-roll, stickers, and SFX to `anchorWordId` rather than absolute seconds. Eliminates overlay drift during transcript trimming. | **Critical** | **M** | $0.00 | **High** |
| **10** | **Declarative Style Recipes (`.vrecipe.json`)** | Hypit (`.svs` in `@hypit/recipe`) | **BUILD NATIVE** | Decouples typography, active karaoke colors, motion presets, and mobile safe areas into reusable versioned JSON templates. | **High** | **M** | $0.00 | **High** |
| **11** | **Viral Structure & Pacing Extractor** | Hypit (`@hypit/narrative-temporal`) | **BUILD NATIVE** | Reverse-engineers viral retention curves (hook duration, cut density, word pace) from reference URLs to guide clip boundaries. | **High** | **L** | +$0.005/ref | **Med** |
| **12** | **Dynamic Punch-In Zooms** | OpenShorts (`punch_in.py`) | **ADAPT** | Applies subtle 12% dynamic push-in on audio beats or transcript emphasis words in native FFmpeg filter graph. | **Med** | **S** | $0.00 | **High** |
| **13** | **Fallback AI B-Roll Generator** | Hypit / OpenShorts | **BUILD NATIVE** | Falls back to Replicate Flux Schnell + Ken Burns motion video when Pexels/Pixabay stock search returns 0 hits for abstract topics. | **Med** | **M** | +$0.003/img | **High** |
| **14** | **Model Context Protocol (MCP) Server** | OpenShorts (`mcp_server.py`) | **BUILD NATIVE** | Lightweight Streamable-HTTP `/mcp` endpoint allowing AI coding agents (Claude Code, Cursor) to automate video generation. | **High** | **S** | $0.00 | **High** |
| **15** | **YouTube Thumbnail Studio** | OpenShorts (`thumbnail.py`) | **ADAPT** | Generates 1280x720 YouTube thumbnails using 10 sampled frames, Anton typography, face crop, and 50-character title optimization. | **High** | **M** | +$0.001/thumb | **High** |
| **16** | **Multilingual Voice Dubbing** | OpenShorts (`translate.py`) | **INTEGRATE** | Integrates ElevenLabs Dubbing API (`/v1/dubbing`) with voice cloning in 29+ languages. Offered as premium paid add-on. | **Med** | **M** | ~$0.15/min | **High** |
| **17** | **Social Media Direct Publishing** | OpenShorts (`upload_post.py`) | **INTEGRATE** | One-click publishing to TikTok, Reels, and Shorts via Upload-Post or Ayrshare REST API. | **Med** | **M** | Monthly SaaS fee | **High** |
| **18** | **AI UGC / Script-to-Video** | OpenShorts (`saasshorts.py`) | **DEFER** | Autonomous UGC generation from product URLs using Kling/Flux. High inference cost ($0.60–$1.20) and diverges from core repurposing. | **Low** | **XL** | +$0.80/vid | **Med** |
| **19** | **Chromium Browser-Capture Rendering** | Hypit (`@hypit/browser-capture`) | **REJECT** | Headless Chrome uses 1.5GB RAM/worker, is 5x slower than FFmpeg, and is legally prohibited under Hypit’s anti-SaaS license. | **Negative** | **L** | High RAM cost | **High** |
| **20** | **Local PyTorch WhisperX Container** | Hypit (`@hypit/whisperx`) | **REJECT** | Heavy Python/CUDA container requiring 4GB GPU VRAM. Groq Whisper cloud API delivers sub-2s results at near-zero compute cost. | **None** | **M** | High GPU cost | **High** |
| **21** | **OpenShorts Cloud Billing (`cloud/`)** | OpenShorts (`cloud/billing.py`) | **REJECT** | Prohibited under OpenShorts Commercial License. VireoClip already has its own multi-tenant Supabase auth and Stripe billing. | **None** | **S** | Legal risk | **High** |
| **22** | **Ultralytics YOLOv8 Tracking** | OpenShorts (`requirements.txt`) | **REJECT** | Licensed under AGPL-3.0 (strict network copyleft contagion). VireoClip uses MediaPipe and OpenCV face tracking safely. | **None** | **S** | AGPL risk | **High** |

---

## 3. Deep-Dive Rationale for Strategic Decisions

### 3.1 The Immediate "Quick-Win" Adoptions (From OpenShorts MIT Code)
1. **The 4+ Clip Retention Floor:**  
   *Problem:* AI models left unconstrained tend to pick only 1 or 2 clips from a 30-minute podcast.  
   *Evidence:* OpenShorts proved empirically that users receiving $\ge 4$ clips return at **40x higher rates** (16.1% vs 0.4%). Implementing `clip_count_targets` in `segmentationService.ts` takes $<1$ day of engineering with zero added compute cost and enormous product retention upside.
2. **Word-Boundary Snapping (`snap_clip_to_words`):**  
   *Problem:* Trimming video on LLM floating-point timestamps cuts into words mid-syllable ("...th- [cut]").  
   *Solution:* Porting OpenShorts' `snap_clip_to_words` ensures cuts always occur during the natural silence preceding and following spoken sentences.
3. **Split-Seam Captioning (`{\an5}`):**  
   *Problem:* When stacking two speakers, captions at the standard bottom 75% height completely obscure the bottom speaker's mouth and chin. Placing captions on the exact middle seam (`{\an5}`) keeps both speakers fully visible.

### 3.2 The High-Impact Architectural Builds (From Hypit Concepts)
1. **Word-Anchored Timeline Binding (`anchorWordId`):**  
   *Problem:* Trimming a filler sentence in the transcript editor causes all downstream B-roll, stickers, and sound effects to drift out of sync with the speaker's voice.  
   *Solution:* Implementing Hypit's semantic projection concept as a native TypeScript `WordAnchor` in `ProducerEditPlan` and `EditorProject` solves this permanently.
2. **Declarative Style Recipes (`.vrecipe.json`):**  
   *Problem:* Font pairings, highlight colors, and layout rules are hardcoded across multiple files.  
   *Solution:* A unified JSON schema allows creators to define brand kits and apply them across multiple videos in one click.

### 3.3 Clear Non-Goals & Rejections
* **Headless Browser Video Rendering:** VireoClip's native C-binary FFmpeg engine renders in 8–12 seconds at ~200MB RAM. Puppeteer rendering takes 45–90 seconds at 1.5GB+ RAM and is legally prohibited under Hypit’s license.
* **AGPL Libraries (Ultralytics):** Zero tolerance for AGPL-3.0 in VireoClip's commercial SaaS codebase.
* **OpenShorts `cloud/` Code:** Quarantined completely. VireoClip's existing Stripe and Supabase architecture is already operational.
