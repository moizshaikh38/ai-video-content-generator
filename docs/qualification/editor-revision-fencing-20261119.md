# Pro editor revision and render-snapshot qualification

Date: 2026-11-19, IST. Branch-only engineering. No production deployment.

## Defect

The editor previously accepted the client's `version` as the stored next version. Autosave sent its unchanged current version. Two overlapping saves could overwrite each other, and a completed old request could mark newer local edits saved. A renderer fenced against `clips.editor_version` but did not bind the actual multi-track `editor_projects` document. Reading that document inside a snapshot transaction alone would still allow a concurrent-save write-skew race.

## Changes

- Public Pro saves require the current positive integer revision. The server owns the next revision and uses owner-bound compare-and-set. An omitted/stale revision returns HTTP 409. No automatic conflict overwrite or reconciliation is attempted.
- Internal split, ripple, filler, duplicate, freeze, audio, B-roll, producer, hook and brand edits pass the revision they actually read. Hook/brand apply no longer submit the next revision as the expected revision. Their revert precondition remains the original snapshot revision plus one, rejecting intervening edits.
- Browser Pro saves update the project and increment the owning clip's editor revision in one Mongo transaction. They mark the Quick projection pending. The second HTTP request carries the acknowledged project ID/version, fences the project and clip, and clears only that matching pending revision. A stale second request cannot overwrite a newer save.
- Server-only Pro operations explicitly opt out of requiring a new Quick projection when none was already pending. They cannot erase an existing pending browser save; the pending marker advances to the new revision instead.
- A pending projection prevents render entry before media/job acquisition and prevents terminal publication. A failed second request remains a visible save error. The user can retry; the already acknowledged Pro version is retained. This is fail-closed recovery, not a single atomic HTTP operation.
- The autosave hook acknowledges version metadata without replacing the current tracks/canvas. An edit made during save remains dirty and is resaved with the new revision. An in-flight `saveNow` returns false. Old-project responses are ignored after switching projects.
- The render records an ID/version/content-digest snapshot of the saved project it actually reads. Terminal publication compares it and writes a fence on the same editor-project document. A concurrent save then conflicts and forces a fresh check. Creation touches the owning clip transactionally, fencing the absent-project case. Actual completed-render revision/digest metadata comes from this render snapshot.
- Stored object paths and previous objects are retained. No deletion, migration, production mutation, release, media acquisition, encoder run or provider spend occurred.
- Direct repository writes retain the existing record validation. A focused malformed-input probe also found that volume was not among the shared numeric schema fields. The editor service now explicitly rejects non-finite volume before mutation.

## Measured evidence

### Real Mongo transactions

`server/scripts/local-qualification/editor-revision-real-mongo.mts`

Final database: `vireo_editor_revision_20261119_0042`, existing loopback Mongo 7 replica set `homeproof`. The script refuses an existing database. Fifteen checks passed. Nine synthetic jobs, nine clips and nine editor projects remain retained.

Checks include one CAS winner from concurrent saves, stale projection rejection, pending projection publication rejection, legacy same-version content-digest mismatch, unchanged-project success with a real write fence, a real transaction paused after its snapshot read while a save completes, first creation during an absent-project snapshot, and racing first initializations yielding one project. The two paused real-transaction negatives leave the old job processing rather than falsely completed.

### Actual HTTP/controller/service path

`server/scripts/local-qualification/editor-revision-http.mts`

Final database: `vireo_editor_http_20261119_0042`. Eight checks passed using a loopback HTTP server, actual controllers/services and Mongo. The owner identity is explicitly synthetic middleware, not production authentication. One project, clip and editor project remain, and zero render jobs. The actual render entry rejects a pending save before a job/media operation. Missing revision, stale Pro save and stale Quick sync return 409; malformed volume returns 400.

### Actual React hook in Chrome

`server/scripts/local-qualification/editor-autosave-browser.mjs` and `.tsx`

Six fixture checks passed using the real autosave hook in installed headless Chrome. Only the two service methods are synthetic deferred promises; transport is disabled. This verifies acknowledgement, preserved newer local text, dirty resave, in-flight export refusal, partial-sync failure/retry, and project-switch response isolation. It is not the whole editor UI or a production-auth test.

The saved and error screenshots were visually inspected. Text is readable and the synthetic-only qualification notice is visible. They are diagnostic save-state evidence, not a new product design or clip-quality improvement.

### Regressions

Final focused test/typecheck results are recorded in the task report and local logs. Do not substitute these fixtures for ordinary media end-to-end evidence.

## Limits and operational handling

- This changes the save contract. Frontend and server must be released coherently. Older callers that omit a revision or treat it as the next revision now fail closed.
- All changed mutations require a transactional Mongo deployment. No unsafe standalone/nontransactional fallback exists. Availability, topology, latency and error handling in the actual deployment are not qualified here.
- A pending save is not repaired by clearing its marker manually. Retry the matching current save, or reconcile/reload an actual conflict. No automatic merge is implemented. Local edits are kept in memory, not a durable offline recovery journal; a reload can lose them.
- Existing saved documents with malformed revisions or legacy duplicate editor projects need review. No migration, duplicate cleanup or index change was run.
- Full-editor pointer interactions, production auth, real storage, reload/restart recovery, ordinary pasted-link-to-finished-clip, subtitle/audio end-to-end behavior, large-file capacity and genuine 4K remain unqualified.
- An unrelated legacy caption-coverage marker backfill is now revision-filtered. It remains best-effort, and its behavior across every old project layout is not newly qualified.
- Earlier isolated qualification databases are retained, including an exploratory malformed-volume probe. No existing user data was read or changed by the new scripts.

Evidence artifacts are under `/downloads/vireo-editor-revision-0034/` in this task's evidence storage. They are not runtime dependencies.
