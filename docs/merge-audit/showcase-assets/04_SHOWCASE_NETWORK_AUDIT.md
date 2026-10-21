# Showcase Browser Network & Console Audit
**Target URL:** `http://localhost:5173/`  
**Test Environment:** Google Chrome (DevTools Network & Console Inspection)  
**Viewport:** 1440×900 and 390×844

---

## 1. Network Request Log

### A. Static Image & Poster Requests (All Successful)
All 10 poster assets requested by the showcase succeed with HTTP 200 and legitimate image MIME types:

| Request URL | HTTP Status | Content-Type | Size / Transfer | Cache / Protocol |
| :--- | :--- | :--- | :--- | :--- |
| `/@fs/.../src/assets/landing/creator-video.webp` | **200 OK** | `image/webp` | 62.4 KB | Vite HMR Module |
| `/@fs/.../src/assets/landing/creator-moment-2.webp` | **200 OK** | `image/webp` | 23.7 KB | Vite HMR Module |
| `/@fs/.../src/assets/landing/creator-moment-3.webp` | **200 OK** | `image/webp` | 23.0 KB | Vite HMR Module |
| `/@fs/.../src/assets/creators/creator-1.jpg` | **200 OK** | `image/jpeg` | 748.1 KB | Vite HMR Module |
| `/@fs/.../src/assets/creators/creator-2.jpg` | **200 OK** | `image/jpeg` | 693.4 KB | Vite HMR Module |
| `/@fs/.../src/assets/creators/creator-3.jpg` | **200 OK** | `image/jpeg` | 746.7 KB | Vite HMR Module |
| `/@fs/.../src/assets/creators/creator-4.jpg` | **200 OK** | `image/jpeg` | 603.5 KB | Vite HMR Module |
| `http://localhost:5173/demo/thumbnails/clip-1-hook.jpg` | **200 OK** | `image/jpeg` | 186.1 KB | Static Asset |
| `http://localhost:5173/demo/thumbnails/clip-2-reaction.jpg` | **200 OK** | `image/jpeg` | 173.5 KB | Static Asset |
| `http://localhost:5173/demo/thumbnails/clip-3-challenge.jpg` | **200 OK** | `image/jpeg` | 168.4 KB | Static Asset |

### B. Video Requests (`/demo/showcase/v*.mp4` — Phantom Requests)
Every video request made by the `CarouselVideo` component targets an uncommitted path:

| Request URL | HTTP Status | Content-Type | Bytes Transferred | Media Demuxer Result |
| :--- | :--- | :--- | :--- | :--- |
| `http://localhost:5173/demo/showcase/v0.mp4` | **200 OK\*** | `text/html` | 1,167 B | **DEMUXER_ERROR (Not a video container)** |
| `http://localhost:5173/demo/showcase/v1.mp4` | **200 OK\*** | `text/html` | 1,167 B | **DEMUXER_ERROR (Not a video container)** |
| `http://localhost:5173/demo/showcase/v2.mp4` | **200 OK\*** | `text/html` | 1,167 B | **DEMUXER_ERROR (Not a video container)** |
| `http://localhost:5173/demo/showcase/v3.mp4` | **200 OK\*** | `text/html` | 1,167 B | **DEMUXER_ERROR (Not a video container)** |
| `http://localhost:5173/demo/showcase/v4.mp4` | **200 OK\*** | `text/html` | 1,167 B | **DEMUXER_ERROR (Not a video container)** |
| `http://localhost:5173/demo/showcase/v5.mp4` | **200 OK\*** | `text/html` | 1,167 B | **DEMUXER_ERROR (Not a video container)** |
| `http://localhost:5173/demo/showcase/v6.mp4` | **200 OK\*** | `text/html` | 1,167 B | **DEMUXER_ERROR (Not a video container)** |
| `http://localhost:5173/demo/showcase/v7.mp4` | **200 OK\*** | `text/html` | 1,167 B | **DEMUXER_ERROR (Not a video container)** |
| `http://localhost:5173/demo/showcase/v8.mp4` | **200 OK\*** | `text/html` | 1,167 B | **DEMUXER_ERROR (Not a video container)** |
| `http://localhost:5173/demo/showcase/v9.mp4` | **200 OK\*** | `text/html` | 1,167 B | **DEMUXER_ERROR (Not a video container)** |

*\*Note on HTTP Status:* Because Vite's development server enables Single-Page Application (SPA) HTML fallback by default, non-existent URLs return the root `index.html` file with status 200 rather than an explicit 404. However, the `Content-Type` is `text/html`, which triggers a decode failure inside HTML5 `<video>` tags.

---

## 2. Browser Console Audit

During live interaction across all 6 showcase tabs:
- **Zero React Exceptions:** No crashes, no unhandled exceptions, no key warnings.
- **Video Playback Handling:** The `CarouselVideo` component wraps playback in `p.catch(() => {})`, cleanly intercepting autoplay restrictions and decode rejections without surfacing unhandled promise rejections.
- **Visual Fallback:** The `<video>` tags gracefully stay on their defined `poster` attribute.
