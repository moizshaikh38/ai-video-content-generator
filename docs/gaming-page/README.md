# VireoClip gaming landing page - revision 3 review build

Status: revision 3 design approved for backup on 17 November 2026. This artifact is not a main-branch merge or live release. It is stored at `public/tools/ai-gaming-clip-generator/`.

## Contents

- `route/`: standalone, dependency-free production page, CSS, JavaScript, self-hosted fonts and media.
- `captions.ass`: cleaned, manually timed commentary captions.
- `action.ass`, `racing.ass`: authored editorial hooks, not speech transcripts.
- `preview.mjs`, `motion.mjs`, `motion-mobile.mjs`: local verification scripts (Playwright required).
- `checks.json`: browser interaction/overflow test results.

The reference was inspected at https://wayin.ai/tools/ai-gaming-clip-generator/ on 17 November 2026. No competitor assets, branding, source code or output were copied.

## Proposed integration boundary

The source archive supplied for development was the frontend at `894b0d81be326105d4d30f1dc8f23010b0ab69dd`. This implementation does not depend on the editor changes after that commit.

This is deliberately independent of the existing `site-pages/catalog.mjs`, `site-pages/styles.css`, `site-pages/demo.js`, site-page build/preview scripts and `tools-site/`. None of those files or the owner's checkout/processes were edited.

Suggested static route after the integration owner reviews the existing site builder and hosting rewrites:

`public/tools/ai-gaming-clip-generator/{index.html,gaming.css,gaming.js,fonts.css,media/}`

All media and font paths are relative, so the route must resolve with a trailing slash. All app entry CTAs target the existing `/dashboard` route found in the supplied `src/App.tsx`; they do not claim to transfer a selected demo layout. Home, Privacy and Terms target routes confirmed in the same source. No upload, account write or generation occurs on this marketing page. No application integration or authenticated dashboard navigation was tested here.

Do not silently overwrite a generated route. If the static builder owns this route at integration time, either add this page as an explicit standalone input or adapt it to that builder after preserving its layout and functionality. Run the integrated deployment's direct-route, asset and CTA checks before release.

The footer currently says "Gaming page preview - Not a live release". Remove that line only as part of an approved production release. Canonical, sitemap and social-image integration remain for the owner after the route is agreed. No fabricated production URL is included.

## Design and interactions

- Original Vireo mark, black/purple palette, gradient pill CTAs.
- User-requested gaming typography revision: self-hosted Oxanium for headings/labels, DM Sans for readable body, Manrope retained for brand text.
- Entrance animation, purple ambient glow, animated timeline/playhead, scroll transforms and hover response.
- Reduced-motion support disables animations/transitions and smooth scrolling.
- Three muted hero previews autoplay only while visible, unless reduced motion or save-data is active. One control pauses/resumes all three. No sound without visitor action.
- Gallery and commentary examples use a large click-to-play button, then native playback/audio/fullscreen controls. Native controls remain available if JavaScript is disabled. Media downloads are deferred until playback.
- Gallery filters select Action, Racing or Commentary. On mobile the three-card gallery scrolls horizontally inside its own container; the page does not overflow.
- Two layout buttons switch between real encoded examples and report pressed state. They do not apply an account preset.
- Native accessible FAQ details. Keyboard focus styling and skip link.
- The media-credit deep link expands its details section.
- No analytics, external scripts, paid API calls or remote font dependencies.

## Media provenance and limitations

Source: "Let's Play 0 A.D." by Fratm.
https://commons.wikimedia.org/wiki/File:Let%27s_Play_0_AD.webm

The source page explicitly lists the recording as CC BY 3.0 with a 12 February 2019 license review. It lists the 0 A.D. game assets as CC BY-SA 3.0. It also notes an additional unspecified-version CC BY-SA grant; this implementation does not rely on that ambiguity.

- Recording license: https://creativecommons.org/licenses/by/3.0/
- Game-asset license: https://creativecommons.org/licenses/by-sa/3.0/
- Game assets credited to 0 A.D. / Wildfire Games.
- Excerpt: original source 06:20.0 to 06:31.8.
- Changes: manual selection, resize/crop, facecam/gameplay split or inset, cleaned manually timed captions, brand overlay, H.264/AAC encoding and poster extraction.
- Edited videos and extracted posters are distributed under CC BY-SA 3.0, with no additional media restrictions. The separate site code and VireoClip trademarks are not offered under that media license.
- Source/license links, credits, changes, media download links and a no-endorsement statement are present on the page. No testimonial or creator affiliation is implied.

This is a calm strategy/commentary sample, not a modern competitive-game clutch. All clips are manually selected and rendered with FFmpeg for the design demo, not produced by Vireo's automatic pipeline. The page says so explicitly. This is not proof of automatic game-event detection, supported per-game presets, competitor superiority or production rendering parity. Body copy avoids those claims.

The captions use verified speech from the excerpt, clean filler words and combine phrases. They are manually timed, not a word-alignment benchmark. The first caption isolates "Age of Empires" from the speaker's introductory filler. No invented quote or narration was added.

Font license notices are in `route/media/licenses/`. Fonts were fetched unchanged from Google Fonts. Licenses verified at:
https://github.com/google/fonts/blob/main/ofl/oxanium/OFL.txt
https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt
https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt

## Verification

The standalone route was exercised in Chromium at 1280, 390 and 320 CSS pixels. Horizontal overflow was caught and fixed. Checks confirm loaded images, no JavaScript errors, layout selection and source switch, FAQ expansion, hero playback and pause. Reduced-motion screenshots were used for complete route inspection; a separate normal-motion video records actual playback, layout switching, scroll and FAQ interaction. This is local browser evidence, not a live release.

Run locally without modifying an existing checkout:

`python3 -m http.server 4182 --directory route`

Open `http://localhost:4182/`. App CTAs intentionally need the real application origin; the standalone server does not provide app routes.

## Additional revision 2 media

Action source: "Red Eclipse 1.5 Gameplay #1 [GNU/Linux]" by Premitre.
https://commons.wikimedia.org/wiki/File:Red_Eclipse_1%2C5_Gameplay_1.webm
Recording CC BY 3.0; game assets Red Eclipse CC BY-SA 3.0. Excerpt 00:55-01:05.5. Edited action video/poster CC BY-SA 3.0.

Racing source: "Benchmark SuperTux Kart Base Profile 2025.07.04 - 10.19.10.02.webm", SuperTuxKart authors, uploaded by PantheraLeo1359531.
https://commons.wikimedia.org/wiki/File:Benchmark_SuperTux_Kart_Base_Profile_2025.07.04_-_10.19.10.02.webm
Recording and edited racing video/poster CC BY-SA 4.0.
https://creativecommons.org/licenses/by-sa/4.0/
Excerpt 00:22-00:32.5. See source for full game credits and asset licenses.

Both: manual vertical crop, resize to 540x960, authored editorial hook text, branding, H.264/AAC encoding and poster extraction. The hooks are not transcribed speech. Footer includes separate attribution, change notices, source/license links and derivative-video downloads. No endorsement by game teams, recorders or uploaders is implied. Share-alike applies to the relevant media, not separate site code or VireoClip trademarks.

Revision 2 checks: muted autoplay, hero pause/resume, reduced-motion no-autoplay, gallery filter/reset, internal mobile gallery scrolling, commentary layout switch, FAQ, images and no JavaScript errors. Local Chromium playback and interaction recordings cover desktop and mobile. Not tested on physical iOS Safari/Android or the integrated production host. A failed exploratory center-tap test on native mobile controls led to larger explicit play buttons; the final buttons were verified through actual clicks with playback-time advancement.

Integration restriction: this artifact has backup approval only. Main merge, live hosting and release remain separate.

## Revision 3 requested device treatment

The three animated hero clips use original CSS iPhone-style frames: rounded metallic body, thin bezel, pill camera cutout, side button and home indicator. No Apple assets, logos or device artwork were copied. The video uses contain sizing within the taller screen so captions are not cropped. Muted autoplay and pause/reduced-motion controls are unchanged. The full page was rechecked at 1280/390/320 CSS pixels after this change.

## Backup integration check

The existing draft marketing builder owns only `/features` and is unchanged. The application hosting configuration currently rewrites extensionless paths to the SPA. The static artifact is present, but production handling of `/tools/ai-gaming-clip-generator/`, redirects, canonical metadata, sitemap and authenticated CTA navigation still need separate integration testing before release. No global rewrite was changed for this backup. Local checks serve this directory as static content and do not establish production route behavior.
