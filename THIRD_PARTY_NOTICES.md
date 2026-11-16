# Third-Party Notices

## Fonts (SIL Open Font License 1.1)

Bundled so the editor preview and the pro export render identical letterforms
(export uses them via FFmpeg drawtext `fontfile=`). License texts ship beside
the font files (`OFL.txt` in each directory).

- **Montserrat** - Copyright 2024 The Montserrat.Git Project Authors
  (https://github.com/JulietaUla/Montserrat)
  Files: `server/assets/fonts/montserrat/`, `public/fonts/montserrat/`
- **Inter** - Copyright (c) 2016 The Inter Project Authors
  (https://github.com/rsms/inter)
  Files: `server/assets/fonts/inter/`, `public/fonts/inter/`

Both are licensed under the SIL Open Font License, Version 1.1. The license
permits bundling and redistribution; the full text is in each family's
`OFL.txt`.

### Caption candidate fonts (2026-11-16)

- JetBrains Mono Bold: Copyright 2020 The JetBrains Mono Project Authors.
  Source: https://github.com/JetBrains/JetBrainsMono (fonts/ttf/JetBrainsMono-Bold.ttf).
  SIL Open Font License 1.1, copied beside the font in server/assets/fonts/jetbrains-mono/OFL.txt
  and public/fonts/jetbrains-mono/OFL.txt.
- League Spartan Regular: Copyright The League Spartan Project Authors.
  Source: https://github.com/google/fonts/tree/main/ofl/leaguespartan.
  A static weight-400 instance was generated from the OFL-licensed variable source with fontTools.
  SIL Open Font License 1.1 is copied beside the font in both bundled locations.

These are public, independently distributed font files, not competitor-provided assets.

- Cal Sans Regular: Copyright 2021 The Cal Sans Project Authors.
  Source: https://github.com/google/fonts/blob/main/ofl/calsans/METADATA.pb
  Unmodified CalSans-Regular.ttf. SIL Open Font License1.1 bundled alongside each copy.
  Public source download: https://raw.githubusercontent.com/google/fonts/main/ofl/calsans/CalSans-Regular.ttf

- Lemon Regular: Copyright 2011 The Lemon Project Authors, Reserved Font Name Lemon.
  Source: https://github.com/google/fonts/blob/main/ofl/lemon/METADATA.pb
  Unmodified Lemon-Regular.ttf, SIL Open Font License1.1 alongside both bundled copies.
  Font: https://raw.githubusercontent.com/google/fonts/main/ofl/lemon/Lemon-Regular.ttf

- Montserrat ExtraBold800: static instance generated with fontTools from the public
  OFL variable font; names updated to Montserrat ExtraBold/Montserrat-ExtraBold to
  avoid stale Thin selection. Existing Montserrat OFL accompanies both directories.
  Source: https://github.com/google/fonts/blob/main/ofl/montserrat/METADATA.pb
  Source font: https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf
  Generated ASCII hmtx advances are in captionMontserratMetrics.ts (UPM1000).

- Poppins Bold: Copyright 2020 The Poppins Project Authors.
  Unmodified public Poppins-Bold.ttf and SIL Open Font License1.1 bundled beside both copies.
  Metadata: https://github.com/google/fonts/blob/main/ofl/poppins/METADATA.pb
  Font: https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf
  ASCII hmtx advances generated from that bundled face are in captionPoppinsMetrics.ts.
