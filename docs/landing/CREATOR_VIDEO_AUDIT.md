# VireoClip — Creator Footage Technical Audit

**Audit Date:** October 11, 2026  
**Tools Employed:** Local FFprobe 9.0.2, Local FFmpeg 9.0.2, Apple Speech Framework (on-device local offline transcription), OpenCV 4.14.0  
**Storage Environment:** 13 GiB free on local volume `/System/Volumes/Data`  

---

## 1. Executive Summary

Five original high-quality creator source videos were discovered and analyzed under `dist/demo/creators/`. All five files are intact, have valid video and dual-channel audio streams, zero stream corruption, and standard 1280×720 landscape framing.

The discovered creators and their video profiles span:
1. **MrBeast** — High-tempo, high-stakes competition challenge (17.7 minutes)
2. **IShowSpeed** — High-energy 60fps livestream reactions and gaming (12.4 minutes)
3. **Joe Rogan** — Multi-camera studio podcast discussion (20.6 minutes)
4. **Lex Fridman** — Deep-dive multi-hour intellectual podcast with Elon Musk (136.8 minutes)
5. **Cristiano Ronaldo** — Studio reaction show from UR Cristiano with split-screen match clips (9.1 minutes)

*(Note: `sourav-joshi/` exists in the creator folder structure with `metadata.json`, but contains no `source.mp4` file.)*

---

## 2. Technical Source Inventory Table

| Creator | Exact File Path | Duration | Resolution | Aspect Ratio | FPS | Video Codec | Audio Track | File Size | Rotation | Stream Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MrBeast** | `dist/demo/creators/mrbeast/source.mp4` | 17m 43s (1063.26s) | 1280×720 | 16:9 | 29.97 | H.264 (High) | AAC-LC, Stereo, 44.1 kHz | 269.92 MB | 0° | Valid / Healthy |
| **IShowSpeed** | `dist/demo/creators/ishowspeed/source.mp4` | 12m 24s (744.62s) | 1280×720 | 16:9 | 59.94 | H.264 (High) | AAC-LC, Stereo, 44.1 kHz | 216.78 MB | 0° | Valid / Healthy |
| **Joe Rogan** | `dist/demo/creators/joe-rogan/source.mp4` | 20m 37s (1237.11s) | 1280×720 | 16:9 | 29.97 | H.264 (Main) | AAC-LC, Stereo, 44.1 kHz | 44.22 MB | 0° | Valid / Healthy |
| **Lex Fridman** | `dist/demo/creators/lex-fridman/source.mp4` | 2h 16m 46s (8206.35s) | 1280×720 | 16:9 | 30.00 | H.264 (High) | AAC-LC, Stereo, 44.1 kHz | 244.10 MB | 0° | Valid / Healthy |
| **Cristiano Ronaldo** | `dist/demo/creators/ronaldo/source.mp4` | 9m 05s (545.79s) | 1280×720 | 16:9 | 25.00 | H.264 (High) | AAC-LC, Stereo, 44.1 kHz | 62.08 MB | 0° | Valid / Healthy |

---

## 3. Detailed Source Breakdown & Scene Characteristics

### 3.1 MrBeast — "Ages 1 - 100 Fight For $500,000"
- **Setting:** Giant indoor arena with concentric red circles and 100 participants aged 1 to 100.
- **Visual Rhythm:** Fast pacing, multiple handheld camera angles, drone overhead shots, clean on-screen challenge graphics.
- **Audio Profile:** High-energy dialogue, clear microphone on Jimmy Donaldson (MrBeast), background cheering, minimal audio clipping.
- **Key Advantage:** Rich narrative arc containing an ultra-catchy opening premise hook, middle temptation elimination challenges, and an emotional $500,000 winner reveal.

### 3.2 IShowSpeed — Gaming & Reaction Highlights
- **Setting:** Multi-scene livestream compilation (bedroom streaming desk, outdoor fan moments, gaming setup).
- **Visual Rhythm:** 60fps high temporal resolution, animated facial expressions, high kinetic movement.
- **Audio Profile:** High dynamic range (shouting, gasps, rapid-fire speech).
- **Curatorial Precaution:** Filtered for clean, brand-safe, professional moments suited for a corporate/SaaS landing page (avoiding segments with profanity or vulgarity). Selected high-energy gaming reaction in Rocket League and horror game play.

### 3.3 Joe Rogan — The Joe Rogan Experience Studio
- **Setting:** Austin studio with iconic red velvet curtains, illuminated neon "THE JOE ROGAN EXPERIENCE" sign, Shure SM7B microphones.
- **Visual Rhythm:** Professional 3-camera podcast switcher (Guest medium, Rogan medium, wide two-shot).
- **Audio Profile:** Studio-grade vocal acoustics, natural conversational pauses, pristine dialogue clarity.
- **Key Advantage:** At 10:37 – 10:48, Joe Rogan speaks directly on mental discipline in front of the neon sign, followed by conversational interaction. Ideal for demonstrating speaker-diarized captions and podcast clipping.

### 3.4 Lex Fridman — Lex Fridman Podcast #400 (Elon Musk)
- **Setting:** Intimate dark podcast studio, black attire, warm accent lighting, Neumann broadcast microphones.
- **Visual Rhythm:** Slow, deliberate, thoughtful pacing, steady eye contact. Matches VireoClip's dark-mode aesthetic.
- **Audio Profile:** Calm, articulate, low ambient noise, pristine speech clarity.
- **Key Advantage:** At 05:00 – 05:28, Elon Musk explains the trajectory of artificial general intelligence and compute scaling. Ideal for professional LinkedIn / Twitter clips with smart hook rewriting and content packaging.

### 3.5 Cristiano Ronaldo — UR Cristiano Studio ("Rating My Best Goals")
- **Setting:** Luxury CR7 lounge with leather Chesterfield sofa, illuminated CR7 neon logo, framed jerseys, warm studio lamps.
- **Visual Rhythm:** Multi-box composite format in 16:9 landscape. Ronaldo sits on the right or center rating his career goals while broadcaster match footage plays on the left.
- **Audio Profile:** Casual conversational English, clear studio lavalier microphones.
- **Key Advantage & Rights Protection:** By using VireoClip's Smart Reframe (9:16 portrait), the crop locks onto Cristiano Ronaldo's expressive face and body on the couch, cropping out the third-party broadcast match replay. This demonstrates subject-aware reframing while dramatically reducing broadcaster copyright exposure.

---

## 4. Hardware & Storage Safety Verification
- **Local Volume:** `/System/Volumes/Data` with 13 GiB available.
- **Transcode Budget:** Short-form web-optimized exports (7 clips × 15–25 seconds) will require less than 150 MB total, leaving over 98% of available disk space untouched.
- **Integrity Guarantee:** Original source videos in `dist/demo/creators/` remain completely untouched, read-only, and preserved.
