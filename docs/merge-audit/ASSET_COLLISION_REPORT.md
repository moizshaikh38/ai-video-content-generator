# 08. Asset Collision Report

**Audit Date:** 2026-10-11  
**Scope:** Complete cross-repository audit of all images, logos, icons, videos, and media assets in `public/` and `src/assets/`.

---

## 1. Asset Inventory Summary

```text
Local Unique Assets:    83 assets (Demo landing MP4s, posters, VTT captions, creator cards v3, vector marks)
Friend Unique Assets:   14 assets (Creator portraits 1-6, demo thumbnails 1-3, purple PNG marks)
Common Shared Assets:   24 assets (Platform SVGs, base creator webp stills, robots.txt)
Exact Path Collisions:  1 asset (public/favicon.ico)
```

---

## 2. Collision Analysis & Resolution Plan

### A. The Only Existing Collision: `public/favicon.ico`
- **Local Version:** 17,470 bytes (Generated from SVG vector icon).
- **Friend Version:** 7,215 bytes (Purple favicon icon).
- **Resolution:** Retain local vector-derived favicon or use friend's purple mark; no functional conflict.

### B. Creator Media & Portraits (Zero Collision)
- **Local Worktree:** Uses WebP formatted creator portraits in `public/demo/landing/creators/`:
  - `mrbeast-card-v3.webp`
  - `ishowspeed-card-v3.webp`
  - `joe-rogan-card-v3.webp`
  - `lex-fridman-card-v3.webp`
  - `ronaldo-card-v3.webp`
  - `messi-card-v3.webp`
- **Friend Repository:** Uses JPG formatted creator portraits in `src/assets/creators/`:
  - `creator-1.jpg` through `creator-6.jpg` (Used by `AiClippingPreview.tsx` as posters).
- **Collision Risk:** **ZERO.** Located in completely different directories with completely different filenames.

### C. Demo Thumbnails (Zero Collision)
- **Friend Repository:** Added 3 JPG thumbnails in `public/demo/thumbnails/`:
  - `clip-1-hook.jpg`
  - `clip-2-reaction.jpg`
  - `clip-3-challenge.jpg`
- **Local Worktree:** Does not have a `thumbnails/` folder in `public/demo/`.
- **Collision Risk:** **ZERO.** Can be imported directly without overwrite.

### D. Brand Logos & Marks
- **Local Worktree:** Vector SVG assets in `src/assets/brand/`:
  - `vireoclip-logo-dark.svg`
  - `vireoclip-logo-light.svg`
  - `vireoclip-symbol.svg`
  - `vireoclip-symbol-white.svg`
- **Friend Repository:** Raster PNG assets in `src/assets/brand/` and `public/`:
  - `vireo-logo-purple.png`
  - `vireo-mark-purple.png`
  - `public/vireo-logo.png`
  - `public/vireo-mark.png`
- **Collision Risk:** **ZERO.** Local uses `.svg`, friend uses `.png`. Both can coexist comfortably.

### E. Video Files Verification Note
- **Audit Discovery:** In `AiClippingPreview.tsx`, the component defines:
  ```ts
  const DEMO_VIDEOS = [
    '/demo/showcase/v0.mp4',
    '/demo/showcase/v1.mp4',
    ...
    '/demo/showcase/v9.mp4',
  ];
  ```
- **Status:** Neither the local worktree nor the friend's GitHub repository contains physical MP4 files under `/public/demo/showcase/`.
- **Component Resilience:** `AiClippingPreview.tsx` is resilient: `CarouselVideo` checks `preload="metadata"`, handles video load failure silently via `catch(() => {})`, and renders the poster image (`poster={posterSrc}`) so the interactive demonstration functions reliably without breaking.

---

## 3. Safe Future Asset Porting Order

1. Copy `src/assets/creators/` directory from friend repo into local `src/assets/creators/`.
2. Copy `public/demo/thumbnails/` directory from friend repo into local `public/demo/thumbnails/`.
3. Copy `src/assets/brand/vireo-*-purple.png` files from friend repo into local `src/assets/brand/`.
4. Copy `public/favicon.png` into local `public/`.
5. Keep existing local `public/demo/landing/` assets untouched for local hero creator cards.
