# Retained-media Studio qualification, 2026-11-19

## Outcome and scope

The actual Studio page, editor hooks/autosave, HTTP controllers, Mongo transactions, render service, loopback object storage, and native browser download completed a small retained-input workflow. This is a local interaction/render proof, not pasted-link acquisition, automatic selection, Auto Layout, Auto Genre, production authentication/storage, subjective quality, native HD or 4K qualification.

Authentication and developer entitlement were synthetic. The source was retained from an earlier authorized run. Its current SHA256 exactly matched the retained genuine-provider transcript's source receipt. Transcript speech/review content identity was checked before cloning it into the new synthetic namespace; word identities and provider lineage were retained. Its quality status remains `unverified`, not accuracy-approved. The source includes a 16 kHz audio stream. No new acquisition or ASR was performed.

Source: 4,374,778 bytes, 634x480, 14.015 seconds. SHA256 `d53093a20c24b1bff5d81b3fbb54c0516cff79f400c56b5699e4c6ff505121a3`. The selected source interval 3.81–6.81 seconds is an explicit manual fixture, not automatic editorial selection. Auto candidate is OFF and the layout is Fill.

## Actual interaction

1. Opened the actual `ClipEditorPage` in local Chrome, not an imitation of the editor shell.
2. Renamed the project, observed real Pro autosave and revision-bound Quick synchronization, reloaded the browser, and verified the title persisted.
3. Opened Export and clicked Start Render. The actual controller queued the render and the actual service published one immutable attempt to loopback storage.
4. Inspected Export Ready and the later Ready to Download screen.
5. Clicked the real Download control, received a native browser download and probed its actual bytes.

The download contains H264 video at 1080x1920/30fps and AAC audio, three seconds, 2,340,027 bytes. SHA256 `94f34a842cc6f3f613bc53fd85b15f131ee2b0c5e7d50faba472ec64f8074e4d`.

Sampled decoded output pixels show the center speaker and flag, changing styled captions, and the existing soft source. This does not establish accurate word timing or listening quality. Encoded-output metering reports -15.7 LUFS and -5.1 dBTP, with listening_verified false.

## Version reconciliation

These counters have different meanings:

- Clip render revision: **2**, shown by the UI as Revision v2 and encoded in the immutable object path.
- Saved editor-project revision: **3**, recorded in the completed job's editor_project_snapshot and the clip's rendered_editor_version.
- Internal clip-configuration fence: **6**, unrelated to the displayed export revision.

A separate read-only Mongo check recomputed the CURRENT saved editor-project digest and matched it to both the completed job and the clip's published digest. Pending Quick sync is null. Digest: `9455abff9e4749333765796e8793f60ec429f2e42fed03cf1da1dbb0b3386d37`. Thus this particular render matches the current saved project, not merely a plausible UI label.

## Resolution defect found and fixed locally

The fixture initially configured render_resolution=720p without prior completed-render metadata. ExportDialog previously initialized only from render_resolution_requested and otherwise selected1080p. It therefore ignored the configured next export tier. Start Render actually sent1080p, and the output matched that submitted request, but this fallback was not a qualified intended choice. The existing warning accurately identifies approximately4x interpolation from the source crop. The 1080p file has no additional native detail.

The local fix makes the configured next export tier authoritative, falls back to valid prior completed metadata for legacy rows, then uses the established1080p default when neither is valid. Six new regression cases and seven existing export-resolution checks pass, 13 total. Frontend/server typechecks pass. An actual ExportDialog browser fixture now visibly selects720p for the configured draft, with no render, Mongo or external call. The existing downloaded artifact was preserved. No second encode was performed to demonstrate this fix, so the delivered MP4 remains the earlier1080p qualification output.

## Limits and recovery

One three-second video encode occurred. Its observed RSS peak was135,901,184 bytes, elapsed1.39 seconds, below256MiB/60seconds. Audio-only measurement and normalization operations also ran, one at a time. No media/provider/storage call left loopback. Ancillary waveform/thumbnails and poster generation were deliberately excluded. The retained evidence directory was approximately11MB before final metadata, below20MiB. Disk and shared memory were checked before/after; the tested encoder wrapper enforced RSS/time. A further forward-only wrapper hardening now also checks the shared-memory floor, disk floor and retained-artifact cap. Those additional checks were not part of the historical encode's claim.

The first completion wait expected the alternate Ready to Download text, although the actual UI had already reached Export Ready. Recovery reused the existing render without another encode. A later native-download fixture failure was traced to the loopback server failing to honor the signed response-content-disposition query parameter. Correcting the mock header behavior enabled the actual native download; application download code was not changed.

The retained new final DB is `vireo_studio_ordinary_20261119_0109`. Two earlier UI-setup attempts are separately retained in0107/0108. No data was deleted. The final DB has one queued seed job created by clip initialization plus the completed render job created by the actual Export controller. No background scheduler is running against these fixture databases. The seed job is not completion evidence and must not be treated as a pending production task.

## Evidence

Local evidence is retained under `/downloads/vireo-studio-ordinary-0105/`: actual MP4, Studio saved/reloaded and download screenshots, original Export Ready screen, result.json, revision-proof.json, draft-resolution-browser.json, draft-720p-selected-after-fix.png, ffmpeg-audit.jsonl and operation logs. The parent received the actual MP4 and decisive screenshots as attachments. Workspace paths alone are not delivery links.

Production readiness remains NO. Ordinary pasted-link acquisition/selection, caption accuracy/sync, generalized layout quality, Auto Genre, genuine4K, production authentication/storage, real server interruption/child cleanup, load and security work remain unqualified.
