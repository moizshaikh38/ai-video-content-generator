# Selection units from new provider transcripts

Clip finding uses persisted segment indexes for both prompting and final timing. A provider can return an entire short upload as one segment, even when its words have real clocks and punctuation. That leaves the clip finder only one possible start/end index.

Newly generated transcripts now derive finer units at terminal provider punctuation only when every provider segment has exact word-text coverage after whitespace normalization, every real word clock is ordered without overlap and contained in its provider segment, and all words are accounted for. Missing words, punctuation or case disagreement, annotations, invalid clocks and cross-segment words keep the entire original segmentation. No clocks, words, spelling or punctuation are invented or corrected. Repeated speech and unfinished tails stay in the transcript.

The original provider segments and an index map are retained as diagnostics. Provider quality assessment is still computed on the original provider output. Top-level caption words remain unchanged. The derived selection units are persisted before the existing transcript source/content binding is computed, so prompt indexes and saved candidate timing use the same array. These metadata fields are diagnostics, not a new authenticity or accuracy seal.

Existing loaded/reused transcripts return before derivation. There is no backfill, selection-time reindexing, candidate rewrite or provider retranscription. Same-owner transcript clones retain their original derived indexes and diagnostic metadata.

Punctuation does not prove a complete thought, speaker turn, semantic highlight, game event or safe crop. Short units may need to be combined by the existing clip finder and duration checks. The existing prompt's opportunity-count target and fallback ranking are not changed here. Retained provider-output replay and local storage tests are not fresh URL-to-selected-captioned-output acceptance. Full processing/hosted acceptance remains separate.
