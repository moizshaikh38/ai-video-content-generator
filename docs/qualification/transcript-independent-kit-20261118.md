# Independent reference preparation checkpoint, 2026-11-18

No new provider execution or accuracy result.

`transcript-review-prepare.mts SOURCE COMPLETED_RUN_DIR NEW_OUTPUT_DIR` checks source/audio hashes against the existing run records, refuses overwrite and copies a source-only review folder. That folder contains source media/audio, a blank word/timing review form and reviewer instructions. The actual hypothesis is kept in a separately named folder with the exact raw provider word strings/clocks and raw-response hash. No machine word or boundary is inserted in the blank reference.

Fresh kit: `/downloads/vireo-transcript-blind-kit-0355`. Source SHA256 `77077a07ad64772757648b96a98f4ed05b0beaf50df231fabd767dd768a2d70d`; prepared audio SHA256 `d07121767b9f60865ae7f4fedd829c4e9ee381b75d13091825b130c112c61f53`. Original run generation `gen-stt-1794951333-LvXyh0uNpnHjcjH854ka`. Script verifies record consistency, not authorship. It cannot turn declarations into actual independent review.

Verified89raw hypothesis records copied unchanged, reference words0, reviewer identity/exposure fields unset and no metrics produced. Prior readers of the hypothesis cannot become blind reviewers by hiding it now. A separate reviewer still needs to listen to the exact source and supply retrievable reference evidence. No available independent reference was invented or derived from the provider output. Hindi, noise and holdouts remain absent.

## Actual provider token boundary finding

Saved raw records contain leading dialogue punctuation and some multi-token-looking text. The old evaluator removed edge punctuation but could leave a leading space, so nonnumeric ` - Okay.` compared unequal to `okay` for an artificial whitespace reason. Normalizationv3trims exterior punctuation AND whitespace together for nonnumeric tokens. Internal hyphens/apostrophes, diacritics and Hindi remain. Numeric tokens still retain signs/punctuation exactly.10synthetic tests pass. No real-source WER was recalculated because a reference still does not exist.

Raw numeric dialogue prefixes and hyphenated token splitting remain conservative metric caveats. Do not silently merge/split/correct the hypothesis or strip numeric signs to produce a better WER. An eventual case must document reference tokenization and read timing coverage alongside word errors. No listening, accuracy or no-rescue completion claim follows from this preparation.
