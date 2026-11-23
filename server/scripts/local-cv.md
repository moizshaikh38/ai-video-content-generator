# Explicit local CV startup

The default env examples keep smart reframe off. Python setup for yt-dlp does not install or enable optional detector models. This command enables local face/person analysis for one launched process only. It does not edit env files, download models or change a deployment.

On Linux, from `server/`, use existing local files:

```sh
node scripts/local-cv.js --python /absolute/path/to/python --person-model /absolute/path/to/nanodet.onnx --face-model /absolute/path/to/yunet.onnx --check
node scripts/local-cv.js --python /absolute/path/to/python --person-model /absolute/path/to/nanodet.onnx --face-model /absolute/path/to/yunet.onnx -- npm run dev
```

Use a Python environment with `opencv-python-headless>=4.10,<5` and `numpy>=2.0`. This command requires both optional models explicitly; it never silently substitutes Haar when YuNet fails. Paths are resolved before the app starts. It sets `PYTHON_PATH`, `SMART_REFRAME_PERSON_MODEL`, `SMART_REFRAME_YUNET_MODEL`, `SMART_REFRAME_ENABLED=true` and `REFRAME_AUTO_GENERATE=true` only in that child process. Existing explicit user choices, source ownership and planner safety rules still apply.

Models and licenses:

- NanoDet `object_detection_nanodet_2022nov.onnx`, 3,800,954 bytes, SHA-256 `4b82da9944b88577175ee23a459dce2e26e6e4be573def65b1055dc2d9720186`. See `python/third_party/nanodet/README.md` and retained Apache-2.0 license. Obtain it separately from the referenced upstream repository. The shared wrapper checks this checksum before loading.
- YuNet `face_detection_yunet_2023mar.onnx`, referenced by `scripts/realmedia-sources.md` with upstream source/license information. The current analyzer and startup probe check local OpenCV load and blank inference, not a model checksum. This is not a supply-chain identity guarantee.

A successful check proves local API compatibility and blank inference only. It does not prove useful face/person accuracy, source-text coverage, source-context preservation, speaker identity, complete thoughts, AutoGenre behavior or publish-ready output. Missing or broken explicit models fail before launch. No automatic model acquisition, package installation, network call or paid fallback occurs.

The existing `/ready` endpoint reports local face/person runtime capability as an advisory field. Optional models left unset by ordinary startup remain `not-configured`. Readiness has a 500ms advisory response budget, so the field can be null while a bounded local probe runs. Overall readiness still depends on its existing core checks, not optional CV. Internal capability results are cached up to 60 seconds, with configured model file metadata changes invalidating the cache; Python/package/script repairs may require cache expiry or an explicit forced check. This is not a guarantee that all optional analyzer subsystems are ready.

The launcher requires Linux `/proc` process-group supervision. It owns a separate group for preflight and the app command, stops remaining group members after child exit, and kills the group on SIGINT/SIGTERM. The 8-second budget applies to the preflight child, plus up to 1.5 seconds to verify cleanup. The launched app has no runtime deadline. A command that deliberately detaches from its group is outside this launcher contract. Child commands run from `server/`, so command paths relative to another caller directory are not preserved.
