# Local Showcase Asset State
**Component:** `src/components/landing/AiClippingPreview.tsx`  
**Wrapper:** `src/components/landing/LandingHero.tsx` (`<div className="vc-showcase-shell"><div className="vc-friend-showcase">`)  
**Stylesheets:** `src/styles/feature-carousel.css`, `src/styles/cinematic-motion.css`, `src/components/landing/cinematic-hero.css`

---

## 1. Local Filesystem Asset Inventory

### A. Poster & Still Image Assets
All 10 poster assets referenced by `DEMO_POSTERS` are present on disk in the local workspace with 100% byte parity to the friend audit clone:

| File Path | Size | SHA256 (first 12 chars) | Status |
| :--- | :--- | :--- | :--- |
| `src/assets/landing/creator-video.webp` | 62,418 bytes | `73bff5d9125d` | **Active & Rendered** |
| `src/assets/landing/creator-moment-2.webp` | 23,678 bytes | `1a9f9895ec3b` | **Active & Rendered** |
| `src/assets/landing/creator-moment-3.webp` | 23,030 bytes | `af6872e48f12` | **Active & Rendered** |
| `src/assets/creators/creator-1.jpg` | 748,052 bytes | `9bce973aebe9` | **Active & Rendered** |
| `src/assets/creators/creator-2.jpg` | 693,389 bytes | `56e61107353b` | **Active & Rendered** |
| `src/assets/creators/creator-3.jpg` | 746,652 bytes | `d6dca5353db5` | **Active & Rendered** |
| `src/assets/creators/creator-4.jpg` | 603,472 bytes | `f4a5620eba57` | **Active & Rendered** |
| `public/demo/thumbnails/clip-1-hook.jpg` | 186,142 bytes | `a296cc9652ad` | **Active & Rendered** |
| `public/demo/thumbnails/clip-2-reaction.jpg` | 173,534 bytes | `e95211daebde` | **Active & Rendered** |
| `public/demo/thumbnails/clip-3-challenge.jpg` | 168,350 bytes | `f36cccd266c7` | **Active & Rendered** |

### B. Video Assets (Showcase Dummy Array vs. Local Real Clips)
- **Hardcoded Showcase Array:** `DEMO_VIDEOS` references `/demo/showcase/v0.mp4` through `v9.mp4`.
- **Physical Disk Reality:** The directory `public/demo/showcase/` does NOT exist on disk.
- **Available Production-Grade Local Clips:** Local workspace currently possesses 8 verified, high-definition MP4 clips in `public/demo/landing/clips/` and `public/demo/landing/reframe/`:

| Real Local File Path | Size | Dimensions | Video Bitrate / Audio |
| :--- | :--- | :--- | :--- |
| `public/demo/landing/clips/mrbeast-clip-01.mp4` | 11.2 MB | 1080×1920 (9:16) | H.264 / AAC 60fps |
| `public/demo/landing/clips/mrbeast-clip-02.mp4` | 8.0 MB | 1080×1920 (9:16) | H.264 / AAC 60fps |
| `public/demo/landing/clips/mrbeast-clip-03.mp4` | 7.9 MB | 1080×1920 (9:16) | H.264 / AAC 60fps |
| `public/demo/landing/clips/ishowspeed-clip-01.mp4` | 1.2 MB | 1080×1920 (9:16) | H.264 / AAC 60fps |
| `public/demo/landing/clips/lex-fridman-clip-01.mp4` | 1.1 MB | 1080×1920 (9:16) | H.264 / AAC 60fps |
| `public/demo/landing/clips/joe-rogan-clip-01.mp4` | 1.0 MB | 1080×1920 (9:16) | H.264 / AAC 60fps |
| `public/demo/landing/clips/ronaldo-clip-01.mp4` | 1.4 MB | 1080×1920 (9:16) | H.264 / AAC 60fps |
| `public/demo/landing/reframe/ronaldo-before.mp4` | 264 KB | 1920×1080 (16:9) | H.264 / AAC 60fps |

---

## 2. Runtime Behavior & Degradation Analysis

1. When `AiClippingPreview` mounts, each `<video src={DEMO_VIDEOS[i]} poster={DEMO_POSTERS[i]}>` attempts to request `/demo/showcase/v*.mp4`.
2. Vite's development server, adhering to standard SPA single-page routing conventions, intercepts the non-existent static file and returns `200 OK` with `Content-Type: text/html` (serving `index.html`).
3. The browser's media demuxer encounters HTML instead of an MPEG-4 container, throws an internal decode error, and suppresses video playback.
4. The browser's native `<video>` implementation falls back to rendering the valid `poster` image.
5. **Net Visual Result:** The component renders its complete UI layout, animated cursor, pulsing badges, progress bars, and tab carousels, but **the video viewport displays static portrait posters rather than live video loops.**
