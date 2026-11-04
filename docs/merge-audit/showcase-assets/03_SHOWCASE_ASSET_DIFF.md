# Showcase Asset Diff & Git History Forensics
**Comparison:** `/Users/moizshaikh/VireoClip-friend-audit` vs. Current Local Worktree  
**Friend Audit Commit:** `0959d090d5dda44b273cd7489ef4ef9af422277b`

---

## 1. Forensic Root Cause: The `.gitignore` Block

A central question of this audit is:  
*"Why did the friend showcase video assets not arrive during the merge?"*

The technical investigation revealed that **the video files were never in the Friend repository to begin with.**

### Evidence from `/Users/moizshaikh/VireoClip-friend-audit/.gitignore`:
```gitignore
# Lines 29-35:
# Archives & Media
*.zip
*.tar.gz
*.mp4
*.mov
*.webm
*.avi
*.mkv
```

### Git Repository Verification:
1. Running `git log --all --full-history -- "**/v0.mp4"` in the friend audit clone yields **0 commits**.
2. Running `find /Users/moizshaikh/VireoClip-friend-audit -name "*.mp4"` yields **0 files**.
3. When the friend author committed `AiClippingPreview.tsx` referencing `/demo/showcase/v0.mp4` through `v9.mp4`, Git automatically excluded the physical `.mp4` files from staging.
4. When pushed to `https://github.com/Mayur0785/VireoClip`, only the TypeScript code and images were transmitted.

---

## 2. Itemized Asset Comparison

| Asset Category | Friend Repo Status | Local Worktree Status | Parity Verdict |
| :--- | :--- | :--- | :--- |
| **Poster Images (10 files)** | Present in `src/assets/` & `public/` | Present in `src/assets/` & `public/` | **100% IDENTICAL (Byte-for-byte SHA256 match)** |
| **Showcase Videos (`v0.mp4`–`v9.mp4`)** | **0 / 10 committed** (gitignored) | **0 / 10 committed** | **Identical absence (Friend repo had zero MP4s)** |
| **Real Demo Clips (`public/demo/landing/clips/`)** | Absent in Friend repo | **8 real MP4s present (32 MB total)** | **Local advantage (Local has real video assets)** |
| **Platform Icons (`src/assets/landing/platforms/`)** | 6 files present | 6 files present | **100% IDENTICAL** |
| **CSS Noise Texture Data URL** | Inline in `feature-carousel.css` | Inline in `feature-carousel.css` | **100% IDENTICAL** |
| **UI Icon Vectors** | Inline SVG in component | Inline SVG in component | **100% IDENTICAL** |

---

## 3. Scene-by-Scene Asset Diff

### A. Scene 1: AI Clipping
- **Source Video:** References `DEMO_VIDEOS[6]`. Missing in friend repo; renders `DEMO_POSTERS[6]` (`creator-4.jpg`).
- **6 Result Clip Cards:**
  - Card 0 (Viral Hook): References `DEMO_VIDEOS[7]`. Renders `clip-1-hook.jpg`.
  - Card 1: References `DEMO_VIDEOS[9]`. Renders `clip-3-challenge.jpg`.
  - Card 2: References `DEMO_VIDEOS[2]`. Renders `creator-moment-3.webp`.
  - Card 3: References `DEMO_VIDEOS[1]`. Renders `creator-moment-2.webp`.
  - Card 4: References `DEMO_VIDEOS[8]`. Renders `clip-2-reaction.jpg`.
  - Card 5: References `DEMO_VIDEOS[0]`. Renders `creator-video.webp`.
- **Conclusion:** 100% asset parity with friend repo. Neither repo had video files; both render identical posters.

### B. Scene 2: AI Captions
- **Main Video Viewport:** References `DEMO_VIDEOS[0]`. Missing in friend repo; renders `DEMO_POSTERS[0]` (`creator-video.webp`).
- **Caption Text & Presets:** Rendered via CSS styling (`Aa`, `Beasty`, `Deep Diver`, `Pod P`, `Youshaei`). 100% parity.

### C. Scene 3: AI Reframe
- **Before Panel (16:9):** Tiles reference `DEMO_VIDEOS[6, 3, 4, 8, 0]`. Render `DEMO_POSTERS[6, 3, 4, 8, 0]`.
- **After Panel (9:16 Split):** Split tiles reference the same indices with CSS zoom and offsets.
- **Conclusion:** 100% asset parity with friend repo.

### D. Scene 4: AI B-roll
- **Talking Head:** References `DEMO_VIDEOS[0]`. Renders `DEMO_POSTERS[0]`.
- **Overlay Scenes:** References `DEMO_VIDEOS[5, 9]`. Render `DEMO_POSTERS[5, 9]`.
- **Suggested B-Roll Rows:** Render posters for indices `5, 9, 8`.
- **Conclusion:** 100% asset parity with friend repo.

### E. Scene 5: AI Audio Clean
- **Video Tile:** References `DEMO_VIDEOS[2]`. Renders `DEMO_POSTERS[2]`.
- **Waveform:** Rendered via React state (`audioBars` array of `<b>` tags). 100% parity.

### F. Scene 6: AI Voice-over / Dubbing
- **Video Tile:** References `DEMO_VIDEOS[0]`. Renders `DEMO_POSTERS[0]`.
- **Waveform & Voices:** Rendered via React state (`voiceBars`) and CSS personas. 100% parity.
