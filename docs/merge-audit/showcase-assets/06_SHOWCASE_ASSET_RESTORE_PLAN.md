# Showcase Asset Restoration & Enhancement Plan
**Status:** Audit & Strategic Plan Only • DO NOT EXECUTE YET

---

## 1. Core Strategic Findings

1. **Friend Repo Reality:** The Friend repository never committed `v0.mp4` through `v9.mp4`. The friend showcase relied entirely on static poster images with CSS animations.
2. **Local Asset Advantage:** The Local repository already possesses **8 real, high-definition, optimized MP4 video clips** in `public/demo/landing/clips/` and `public/demo/landing/reframe/` (MrBeast, IShowSpeed, Lex Fridman, Joe Rogan, Cristiano Ronaldo).

---

## 2. Strategic Options for the User

### Option A: Retain Exact Friend Baseline (Static Poster Experience)
- **Concept:** Maintain the showcase exactly as the friend created it, using the 10 static poster images.
- **Pros:** Zero risk of high video decoding overhead; 100% faithful to the friend's committed GitHub code.
- **Cons:** Videos do not actually play; browser requests `/demo/showcase/v*.mp4` in vain (falling back to posters).

### Option B (RECOMMENDED): Connect Friend Showcase to Real Local Video Clips (High-Fidelity Upgrade)
- **Concept:** Update the `DEMO_VIDEOS` array in `AiClippingPreview.tsx` to point to the real, working MP4 files already present in the local repository.
- **Proposed Mapping:**
  - `DEMO_VIDEOS[0]` → `/demo/landing/clips/mrbeast-clip-01.mp4`
  - `DEMO_VIDEOS[1]` → `/demo/landing/clips/mrbeast-clip-02.mp4`
  - `DEMO_VIDEOS[2]` → `/demo/landing/clips/mrbeast-clip-03.mp4`
  - `DEMO_VIDEOS[3]` → `/demo/landing/clips/ishowspeed-clip-01.mp4`
  - `DEMO_VIDEOS[4]` → `/demo/landing/clips/lex-fridman-clip-01.mp4`
  - `DEMO_VIDEOS[5]` → `/demo/landing/clips/joe-rogan-clip-01.mp4`
  - `DEMO_VIDEOS[6]` → `/demo/landing/clips/ronaldo-clip-01.mp4`
  - Reframe Before → `/demo/landing/reframe/ronaldo-before.mp4`
- **Pros:**
  - Live, moving video clips playing seamlessly across all 6 slides.
  - Eliminates the 10 invalid `/demo/showcase/v*.mp4` network requests.
  - Perfect synergy between the **Friend's superior carousel choreography** and **Local's superior real video content**.
- **Cons:** Slightly higher video decoding load on low-power mobile devices (already mitigated by `AiClippingPreview`'s lazy video unmounting).

### Option C: Request Uncommitted MP4s from Friend
- **Concept:** Ask the friend to provide their original local `v0.mp4`–`v9.mp4` files from their machine (which were blocked by `.gitignore`).
- **Pros:** Preserves whatever specific footage the friend had locally.
- **Cons:** Blocks development waiting for manual file transfer; unknown quality or copyright status.

---

## 3. Step-by-Step Restoration Plan (Upon Future Approval)

1. **Step 1:** Confirm with user whether Option B (connecting real local MP4s) is preferred.
2. **Step 2:** If approved, update `DEMO_VIDEOS` and `DEMO_POSTERS` in `src/components/landing/AiClippingPreview.tsx` to use the real `/demo/landing/clips/*` paths.
3. **Step 3:** Validate in browser that videos play smoothly on desktop and pause appropriately when tabs change.
4. **Step 4:** Verify that mobile (390×844) gracefully handles video playback without frame rate drops.
5. **Step 5:** Run full backend and frontend validation suites.

*Execution is blocked pending user review and explicit direction.*
