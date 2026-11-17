# Multimodal source and transcript snapshot freshness

The worker now carries the source download's verified snapshot receipt into its
analysis metadata. Receipt issuance is the existing conditional-download contract:
actual downloaded SHA256, strong ETag, object key/size, stable pre/post HEAD and
conditional GET. A later HEAD does not retroactively certify unrelated old files.
Local-path analyses without a download receipt remain unverified.

The worker separately records a canonical SHA256 identity of the supplied
transcript snapshot (id/update time, content, clocks, language and quality state).
That hash detects changed inputs; it is NOT evidence that the transcript is
correct, that it was produced from this source, or that audio alignment is good.
This distinction leaves E1's provider/source/reference gap fully open.

Normal clip-selection and multimodal API/search consumers now call the fresh
analysis boundary. It verifies current owner-scoped source key, strong HEAD
validator/size, current transcript snapshot and no needs_review status. Missing
receipts, changed key/bytes/transcript, weak validators or failed source access
withhold the old multimodal record. Raw internal retrieval remains available for
diagnostics. No stored records are migrated or stamped current.

An existing but unverifiable API record returns a specific 409 instead of being
misreported as absent. Search may use its existing transcript-only fallback with
not-run detector receipts. Selection continues without unsupported sensor data,
subject to the separate unranked/score-dimension contract.

Verification used an actual 0.5-second encoded source, local HTTP storage with
HEAD/conditional GET, actual worker scene/silence/volume FFmpeg extraction,
actual Mongo persistence, and actual fresh reads. Only CV and OCR were stubbed,
explicitly unavailable/not-run rather than fabricated detections. Verified:
- Saved SHA256 equals the actual downloaded source bytes.
- Matching current source and transcript allow the record.
- Same-size changed object bytes/ETag, changed key, weak validator, changed
  transcript text and missing legacy receipt all withhold the record.
- Another owner's read returns no record.
- Transcript snapshot hashing ignores key order but changes with timing, speech,
  language or review-state changes.

Focused source/score/selection set: 46 passed. Both typechecks passed. A further
fresh baseline passed 88/88. No UI or provider-language benchmark was run here.
The pre-existing wider genre-count assertion remains open.

Limits: HEAD establishes validator continuity at read time, not browser media
range-fetch parity or a race-free distributed transaction. These receipts do not
validate the transcript's ORIGINAL relationship to the source. No stale record
is automatically rerun; legacy analyses may need explicit reanalysis, with real
resource/cost implications before release. Nothing was deployed. No new spend,
login/auth changes, production data edits or 4K attempt occurred.
