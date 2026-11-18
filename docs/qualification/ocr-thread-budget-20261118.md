# Bounded OCR threading

18 November 2026. Existing optional OCR path only; no default activation.

Tesseract's default OpenMP threads caused substantial overhead on this host. A fresh single-frame screen test produced byte-identical TSV with default, one-thread and two-thread settings, with observed times1.059s,0.305s and0.321s respectively. This is a local measurement, not a universal speed guarantee.

The OCR child process now receives OMP_THREAD_LIMIT=1 without changing the parent's environment. Existing timeout, PSM11, full-scene/lower-half passes, detection thresholds and sample clocks remain unchanged. Calls remain sequential. No new package or model was added and no DB model license assumption is needed for this change.

Fresh full8s screencast analysis took12.3s versus37.6s in the earlier default-thread run. All395 protected-region objects are identical. Real EditorShell Auto preview, saved/reloaded project and normal queued export inspected: complete screen stays visible and fine text remains small. Full decoded video SHA256 matches the earlier actual queued output exactly:95ec234bffec33c3d42743461010743ccd66ae898734da2c8c2cc5ef55f93d1f. Therefore this is a bounded runtime improvement, not new visual quality or semantic understanding.

Seven Python parser/persistence/resource tests pass, including per-child thread bound, existing arguments/timeouts, sequential invocation and unchanged parent environment. Artifacts: vireo-context-screen-ocr1-ui-1432 and vireo-context-screen-ocr1-job-1433; single-frame benchmark vireo-ocr-thread-benchmark-1432.json.

The existing Tesseract runtime package states Apache2 in its installed copyright. Official project and standard tessdata repository also publish Apache2 licenses:
https://github.com/tesseract-ocr/tesseract/blob/main/LICENSE
https://github.com/tesseract-ocr/tessdata/blob/main/LICENSE
This is not automatic clearance for any unrelated language/model downloaded later. No dependency/model is bundled by this patch.

OCR remains opt-in and sampled. Resource-budget admission, runtime installation checks, broader false-positive/miss coverage, safe action/speaker/layout choice and readable final output remain unfinished. Do not count manual intervals and empty-transcript protocol fixtures as automatic selection acceptance. Main/live and spend unchanged.
