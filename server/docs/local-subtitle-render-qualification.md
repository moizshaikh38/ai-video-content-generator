# Local Subtitle and render qualification

This is a synthetic integration check, not a production smoke test. It refuses a non-loopback Mongo URI, creates a fresh UUID-named fixture database, installs the current schema, and drops only that newly created database on completion. Never point it at customer data. Mongo must support transactions.

## Run

Install the locked Node dependencies and prepare the normal Python/media environment. Build the server with the repository's normal build command. Have FFmpeg available on PATH, or set `FFMPEG_BIN`.

From `server/`, with a local replica set already running:

```sh
MONGODB_URI='mongodb://127.0.0.1:27027/?replicaSet=localFixture' \
  node scripts/qualify-local-subtitle-render.mjs
```

`VIREO_QUALIFICATION_COMMIT` can label the receipt. That label is caller-supplied metadata, not independent proof of source identity. Verify the checkout and build separately.

The script prints an output directory under the system temp directory. Keep `receipt.json`, `state.json`, `rendered.mp4`, and `poster.jpg` as acceptance evidence. Open the actual MP4 and poster to inspect their pixels. A zero exit status does not verify visual quality or listening quality.

## What it checks

- Actual compiled HTTP authentication middleware and Supabase client, against an explicit loopback synthetic identity endpoint. Missing/bad tokens fail, and another synthetic tenant cannot read the project or download.
- Subtitle transcription, local audio extraction and source lineage with an explicit synthetic STT implementation. Initial transcription consumes one synthetic wallet credit. Verified reuse consumes zero extra credits and does not call STT again.
- Prepared candidate creation and replay through real HTTP routes, a saved editor baseline, one admitted job, and the actual Free render quota policy.
- Actual Pro graph FFmpeg encoding, captions, Free watermark, source checks, local object upload, atomic completed-job/ready-clip publication, and poster creation.
- An injected storage PUT503 leaves the same job queued with native BSON dates and no output reference. Download remains unavailable. After its own backoff, retry completes the same job on attempt two without another render quota entry.
- Owner signed-download fetch returns bytes identical to the local uploaded MP4.
- Replacing the source during STT releases the synthetic reservation, stores no transcript, and returns HTTP409 with the source-review code.

The script enables API role and V1 admission only inside its process, then explicitly invokes the compiled executor service for the admitted job. It does not exercise the hosted worker scheduler or change hosted configuration. The emulator implements only the storage/auth behavior needed by this fixture. It is not an S3 or Supabase conformance test.

## Limits

The source is three seconds of generated colorbars and sine audio at640x360, interpolated to1920x1080. The run uses one FFmpeg thread, an ultrafast encoder preset and explicit center/manual framing without CV. STT, identity and storage are synthetic loopback fixtures. No paid provider call, real speech accuracy, actual user upload, browser editing, hosted account, representative load, long video or4K quality is established. The synthetic quota wallet grant is not a payment or monthly issuance-policy test.

The source-text reviewer may report unknown when preserving disk margin. This is expected and must not be presented as evidence that source subtitles are absent. The encoded audio measurement is not a listening check. Production release still needs its separate deployment, account, data, resource and output gates.
