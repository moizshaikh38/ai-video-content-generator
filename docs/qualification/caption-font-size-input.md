# Caption font-size input correction

17 November 2026. Isolated numeric-input fix, based on owner caption baseline aa31753. No preset, grouping or anchor changes.

The controlled number field previously clamped every keystroke. Replacing96 with104 could commit32 for the first digit and then grow/clamp to110. The new input keeps incomplete text local and applies the complete value on blur or Enter. Escape restores the committed value. ArrowUp/ArrowDown step and commit immediately. Mouse spinner edits stay in the field until blur/Enter, the same as typed drafts. The existing range slider remains live and unchanged. Field width now fits all three digits beside native spinner controls.

Browser qualification used the actual CaptionStyleCustomizer component and existing Vite/index.css. Sequential keypress replacement96 ->104 stayed104, with no caption update before blur; blur applied104. Enter applied once. Escape restored104 without a second update. Empty restored104. Out-of-bounds999 and1 committed110 and32. Keyboard spinner96 ->97 ->96 worked. Bungee220 was accepted and999 clamped to284. External value/font changes sync before the next paint to prevent a pending effect overwriting fast typing. Inspected screenshots show the full104 and284 values, not cropped digits.

11 unit/bounds tests and both TypeScript checks passed. The browser harness and fixtures live under server/scripts/local-qualification/caption-size-input/. Run its check.cjs from a checkout with existing frontend dependencies, Playwright available and /usr/bin/google-chrome installed. It writes evidence under /downloads/caption-size-input-evidence/ and uses its own Vite port5196. It does not access accounts or a database.

This is a component interaction check. Owner should verify the same replacement/commit behavior in actual Studio before closing the reachable defect. No deployment or real-account save/export was performed here.
