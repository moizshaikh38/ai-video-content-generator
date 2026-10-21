# Friend Showcase Asset Manifest
**Component:** `src/components/reactbits/AiClippingPreview.tsx`  
**Stylesheet:** `src/styles/feature-carousel.css`  
**Friend Source Commit:** `0959d090d5dda44b273cd7489ef4ef9af422277b`

---

## 1. Executive Summary

This manifest itemizes every asset, video, image, poster, SVG, and texture referenced by the Friend feature showcase component.

The critical finding of this audit is that **the Friend repository at commit `0959d09` contained zero `.mp4` video files.** The friend author added `*.mp4` to `.gitignore` (lines 29–35), which prevented Git from ever tracking or committing the 10 demo video files (`/demo/showcase/v0.mp4` through `/demo/showcase/v9.mp4`).

Consequently, the Friend showcase in both the original friend repository and the local integration has been falling back to its 10 static poster images via HTML5 `<video poster="...">` error handling.

---

## 2. Complete Asset Manifest Table

| Scene | Asset Name | Friend Source Path | Type | File Size | Dimensions / Format | How Referenced | Local Status | Current Local Substitute | Action Needed |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **All / General** | `v0.mp4` | `/demo/showcase/v0.mp4` | Video | *0 bytes (Not committed to Git)* | 1080p MP4 | `DEMO_VIDEOS[0]` | **MISSING** | Poster `creator-video.webp` | Map to local real MP4 or restore video file |
| **Clipping** | `v1.mp4` | `/demo/showcase/v1.mp4` | Video | *0 bytes (Not committed to Git)* | 1080p MP4 | `DEMO_VIDEOS[1]` | **MISSING** | Poster `creator-moment-2.webp` | Map to local real MP4 or restore video file |
| **Clipping / Audio** | `v2.mp4` | `/demo/showcase/v2.mp4` | Video | *0 bytes (Not committed to Git)* | 1080p MP4 | `DEMO_VIDEOS[2]` | **MISSING** | Poster `creator-moment-3.webp` | Map to local real MP4 or restore video file |
| **Reframe** | `v3.mp4` | `/demo/showcase/v3.mp4` | Video | *0 bytes (Not committed to Git)* | 1080p MP4 | `DEMO_VIDEOS[3]` | **MISSING** | Poster `creator-1.jpg` | Map to local real MP4 or restore video file |
| **Reframe** | `v4.mp4` | `/demo/showcase/v4.mp4` | Video | *0 bytes (Not committed to Git)* | 1080p MP4 | `DEMO_VIDEOS[4]` | **MISSING** | Poster `creator-2.jpg` | Map to local real MP4 or restore video file |
| **B-roll** | `v5.mp4` | `/demo/showcase/v5.mp4` | Video | *0 bytes (Not committed to Git)* | 1080p MP4 | `DEMO_VIDEOS[5]` | **MISSING** | Poster `creator-3.jpg` | Map to local real MP4 or restore video file |
| **Clipping / Reframe** | `v6.mp4` | `/demo/showcase/v6.mp4` | Video | *0 bytes (Not committed to Git)* | 1080p MP4 | `DEMO_VIDEOS[6]` | **MISSING** | Poster `creator-4.jpg` | Map to local real MP4 or restore video file |
| **Clipping** | `v7.mp4` | `/demo/showcase/v7.mp4` | Video | *0 bytes (Not committed to Git)* | 1080p MP4 | `DEMO_VIDEOS[7]` | **MISSING** | Poster `clip-1-hook.jpg` | Map to local real MP4 or restore video file |
| **Clipping / Reframe / B-roll** | `v8.mp4` | `/demo/showcase/v8.mp4` | Video | *0 bytes (Not committed to Git)* | 1080p MP4 | `DEMO_VIDEOS[8]` | **MISSING** | Poster `clip-2-reaction.jpg` | Map to local real MP4 or restore video file |
| **Clipping / B-roll** | `v9.mp4` | `/demo/showcase/v9.mp4` | Video | *0 bytes (Not committed to Git)* | 1080p MP4 | `DEMO_VIDEOS[9]` | **MISSING** | Poster `clip-3-challenge.jpg` | Map to local real MP4 or restore video file |
| **Captions / Voiceover** | `creator-video.webp` | `src/assets/landing/creator-video.webp` | Image | 62,418 bytes | 1080×608 WebP | `import ... from ...` (`DEMO_POSTERS[0]`) | **EXACT MATCH** | Renders perfectly | Keep as-is |
| **Clipping** | `creator-moment-2.webp` | `src/assets/landing/creator-moment-2.webp` | Image | 23,678 bytes | 540×960 WebP | `import ... from ...` (`DEMO_POSTERS[1]`) | **EXACT MATCH** | Renders perfectly | Keep as-is |
| **Audio** | `creator-moment-3.webp` | `src/assets/landing/creator-moment-3.webp` | Image | 23,030 bytes | 540×960 WebP | `import ... from ...` (`DEMO_POSTERS[2]`) | **EXACT MATCH** | Renders perfectly | Keep as-is |
| **Reframe** | `creator-1.jpg` | `src/assets/creators/creator-1.jpg` | Image | 748,052 bytes | 1080×1350 JPEG | `import ... from ...` (`DEMO_POSTERS[3]`) | **EXACT MATCH** | Renders perfectly | Keep as-is |
| **Reframe** | `creator-2.jpg` | `src/assets/creators/creator-2.jpg` | Image | 693,389 bytes | 1080×1350 JPEG | `import ... from ...` (`DEMO_POSTERS[4]`) | **EXACT MATCH** | Renders perfectly | Keep as-is |
| **B-roll** | `creator-3.jpg` | `src/assets/creators/creator-3.jpg` | Image | 746,652 bytes | 1080×1350 JPEG | `import ... from ...` (`DEMO_POSTERS[5]`) | **EXACT MATCH** | Renders perfectly | Keep as-is |
| **Clipping / Reframe** | `creator-4.jpg` | `src/assets/creators/creator-4.jpg` | Image | 603,472 bytes | 1080×1350 JPEG | `import ... from ...` (`DEMO_POSTERS[6]`) | **EXACT MATCH** | Renders perfectly | Keep as-is |
| **Clipping** | `clip-1-hook.jpg` | `public/demo/thumbnails/clip-1-hook.jpg` | Image | 186,142 bytes | 720×1280 JPEG | URL `/demo/thumbnails/...` (`DEMO_POSTERS[7]`) | **EXACT MATCH** | Renders perfectly | Keep as-is |
| **Clipping / Reframe** | `clip-2-reaction.jpg` | `public/demo/thumbnails/clip-2-reaction.jpg` | Image | 173,534 bytes | 720×1280 JPEG | URL `/demo/thumbnails/...` (`DEMO_POSTERS[8]`) | **EXACT MATCH** | Renders perfectly | Keep as-is |
| **Clipping / B-roll** | `clip-3-challenge.jpg` | `public/demo/thumbnails/clip-3-challenge.jpg` | Image | 168,350 bytes | 720×1280 JPEG | URL `/demo/thumbnails/...` (`DEMO_POSTERS[9]`) | **EXACT MATCH** | Renders perfectly | Keep as-is |
| **Card Texture** | Noise Grain | CSS data URL | SVG | 258 chars | 160×160 fractal noise | `background-image: url("data:image/svg+xml...")` | **EXACT MATCH** | Inline CSS render | Keep as-is |

---

## 3. Visual Classification Summary

- **Total Assets Referenced:** 21 items
  - Real Video Files referenced in code: **10** (None committed in Friend Git repository)
  - Real Image / Poster Files: **10** (100% committed, 100% byte-identical in Local)
  - CSS Textures / Data URLs: **1** (100% identical in Local)
  - UI Icons (Tabs, Arrows, Cursor): **Inline SVG / Lucide React** (0 external HTTP requests)
