# Streamed object-file upload, 2026-11-19

## Correction

uploadFile previously read the complete source/rendered file into a Buffer, then hashed and uploaded it. That added an explicit file-sized allocation to URL imports, ordinary render output, Subtitle Studio, producer previews and poster uploads. It was a separate large-media capacity risk, independent of encoder memory.

The local implementation checks the supplied length against the actual regular file, streams it through a 64-KiB read/hash transform, and sends an explicit Content-Length. The SHA-256 receipt comes from bytes fed through the upload stream. It rejects growth/short reads and destroys owned streams plus aborts the request on error. There is no whole-file read in this function.

This is not a constant-memory guarantee for the entire SDK, HTTP transport or application. Stream high-water marks do not cap every downstream allocation.

## Actual SDK/HTTP test

The actual uploadFile and AWS SDK were exercised against an in-process loopback-only HTTP endpoint using a synthetic 4-MiB file, not media. The endpoint hashed received bytes without storing the whole body. The streamed receipt and received-byte hashes matched exactly. A wrong declared file length failed before any HTTP request. A deliberate 503 failed once without silent replay. Largest observed HTTP chunk was 65,536 bytes.

Measured process RSS rose from 103,280,640 to 122,585,088 bytes, a 19,304,448-byte increase across this small SDK-plus-test-server run. Do not infer large-file RSS scaling or 4K capacity from it. Shared-memory peak was 1,362,784,256 bytes; the test finished in 0.50 seconds, with approximately 4.21 MiB of retained work under the 20-MiB work/15-second/350-MiB free-disk guard.

The earlier real SDK two-attempt path/signing/readback test also passed again with streaming enabled: PUT new, PUT late old to its distinct attempt key, and both actual signed GET responses matched their respective bytes/hashes.

Server TypeScript passed. Two source-level regression checks pin the no-whole-file-buffer and cleanup/length wiring. They complement the actual loopback transport check, not replace it.

Reproduction script: server/scripts/local-qualification/streamed-upload-loopback.mts. Evidence is retained locally. No R2 bucket, production storage, provider, encoder, real media, install or paid resource was used.

## Compatibility and release limits

A streamed request is not replayable by the SDK like the old Buffer. The test confirms a failed streamed request is not silently retried. Higher-level bounded job retries must recreate/reopen the source file and use the appropriate attempt identity. Callers without a queue retain their existing error path; no new automatic retry loop was added.

Actual R2 behavior, interrupted connection/partial PUT cleanup, long-file RSS/disk scaling and normal render/import/export end-to-end remain unqualified. This change does not authorize another media or 4K probe. Source detail, composition, captions, source acquisition, GPU/CPU and aggregate capacity are separate release gates.
