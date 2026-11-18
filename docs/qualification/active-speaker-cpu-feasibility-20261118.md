# Bounded CPU audiovisual feasibility, not active-speaker acceptance

18 November 2026. Research and local qualification only. Product behavior unchanged from source-cut fix0567d8d. No model, runtime package or inference hook added to the product.

## What was tested

An isolated ONNX CPU runtime processed four manually selected1.2second windows from a real audiovisual source excerpt. The source starts30seconds into the existing original Erica file. A960x540,23.976fps12.012second derivative retains real source audio, verified by stream probe and speech-bearing audio extracts. Actual normal analyzer, EditorShell Auto and direct export were inspected separately. That derivative exceeds the automatic OCR<=12s request gate and is correctly not-requested, not OCR-qualified. Its Auto uses Fit; this is not evidence of speaker-driven switching.

Inference uses the existing measured YuNet face tracks, with no link across scene cuts,25fps resampling and16kHz mono audio. Each1.2second window has30face frames and120MFCC frames, source audio, muted audio and+500ms shifted audio. Model/source hashes and no-cross-cut assertions checked before inference. Decoded source times are recorded:23.976to25fps conversion repeats some source frames, rather than pretending to decode extra distinct frames. Padded track boxes are a prototype, not proven equivalent to the original face detector/crop pipeline.

## Resource boundary and results

Five current-run qualification directories contained10exact SHA256-duplicate media copies. Replacing only duplicate copies with hardlinks preserved paths/bytes, sources and unique evidence, reclaiming about15.2MB. Local per-file cleanup manifest retained. Disk302to317MB free before runtime work. Added-disk cap100MB and free-disk floor200MB set before the experiment. Package archives plus expanded runtime/model peaked about76MB; hashed disposable archives removed afterward. About259MB free remained. Existing CV environment was not changed; runtime lives in an isolated directory. No PyTorch/training/GPU stack installed.

ONNX Runtime1.23.2 CPU, one intra/inter thread. Four windows x three conditions: roughly0.11-0.13seconds/model+head invocation on this host, excluding video decode, feature extraction, tracking, cold session allocation and wider context ensembles. Peak processRSS around220-222MiB. These are not service latency or concurrent-worker guarantees.

| Manually selected relative window | Source positive-frame fraction | Muted | +500ms audio |
| --- | ---: | ---: | ---: |
|0.0-1.2s, reaction face |0%|0%|0%|
|1.5-2.7s, woman face with source speech |0%|0%|0%|
|3.5-4.7s, direct question |90%|0%|73%|
|10.3-11.5s, direct speech |53%|0%|0%|

Raw head score>=0 is the fork demo convention, not a calibrated probability. The delayed-audio result stays positive in the direct-question window; another speech-bearing face window remains negative. Do not claim verified audio-to-person association, trustworthy synchronization rejection, speaker identity, diarization, general accuracy or readiness to drive camera switches. There is no simultaneous multi-person real-speech test yet. Short contexts, preprocessing, resampling, model training lineage and true source sync remain possible causes. The initial nearest-sample lookup crossed a measured cut and correctly stopped the experiment; final harness restricts nearest boxes to the selected track, bounds their time distance and rejects windows spanning a cut.

Input crop pixels and speech extracts were inspected privately. Local artifacts vireo-asd-cpu-private-1518 and final reproducible vireo-asd-cpu-private-repro-1519. Footage redistribution permission is not established, so no source/crop media is in the repository or forwarded as deliverable. No recognition API, source upload, new spending, main/live deployment or model activation.

## Artifacts and licensing boundaries

Original Light-ASD code and official weights are in an MIT repository. The tested ONNX comes from a distinct MIT fork, not the official original binary. Its export script names rknn_v21.model, not the official AVA_CVPR weight, so benchmark-equivalence and exact original-weight conversion parity are unverified. Keep it research-only. No pickle weights were loaded or arbitrary repository demo executed. Only inspected ONNX files were loaded by the isolated inference runtime.

- Tested fork commit77e9d191faa17e8aac08a90dd039a20b24bddb41.
- lightASD.onnx4184569bytes, SHA25687929633815be81d18d042afac609ff6ef650719c29c2d5efd2dfb1de4de8f35.
- lossAV.onnx1737bytes, SHA2562bcca3110f7cdae267398deeb3080032f2cc952ccf0f565e6341808704743b41.
- Isolated dependencies: onnxruntime1.23.2, flatbuffers25.9.23, protobuf6.33.0 and python_speech_features0.6, using existing NumPy/SciPy. Dependency license/security audit and deployment packaging remain release work, not implied by a successful local import.

The active-speaker-cpu-feasibility.py harness is qualification-only. It expects the exact private local source, normal-track JSON and derived audio named in the script, plus isolated runtime/model manifest under VIREO_ASD_EVAL_ROOT. Pass a new output directory. It has no network calls. Compiles and actually reran with hash/cut/decoded-clock assertions; not added to product runtime or automated safe suite.

## Recommendation

Keep shared/stable geometry when identity is unresolved. Preserve the feasible small CPU route, but do not wire raw mouth-motion or this uncalibrated model into speaker crops. Next tests need longer clean same-shot speech, offscreen voice, silence, music, delay sweeps and simultaneous speakers, source-aligned audio and independently reviewed labels. Establish abstention and hysteresis before a separate product proposal. Existing word snapping is timing alignment only, not diarization.

## Inspected primary sources

1. Official Light-ASD repository, code and weight context: https://github.com/Junhua-Liao/Light-ASD . Pinned license: https://raw.githubusercontent.com/Junhua-Liao/Light-ASD/ed38c232de5efe0261dbd68627c0ade7cdfe14eb/LICENSE .
2. Official model/demo assumptions, CUDA and preprocessing: https://raw.githubusercontent.com/Junhua-Liao/Light-ASD/ed38c232de5efe0261dbd68627c0ade7cdfe14eb/ASD.py and https://raw.githubusercontent.com/Junhua-Liao/Light-ASD/ed38c232de5efe0261dbd68627c0ade7cdfe14eb/Columbia_test.py .
3. CVPR paper, benchmark/resource claims only: https://openaccess.thecvf.com/content/CVPR2023/papers/Liao_A_Light_Weight_Model_for_Active_Speaker_Detection_CVPR_2023_paper.pdf . Not transplanted into local quality results.
4. Tested ONNX fork/source: https://github.com/tiwater/Light-ASD . Pinned conversion source: https://raw.githubusercontent.com/tiwater/Light-ASD/77e9d191faa17e8aac08a90dd039a20b24bddb41/gen_asd_rknn.py . Pinned inference source: https://raw.githubusercontent.com/tiwater/Light-ASD/77e9d191faa17e8aac08a90dd039a20b24bddb41/inference_onnx.py .
5. Exact downloaded model URLs: https://raw.githubusercontent.com/tiwater/Light-ASD/77e9d191faa17e8aac08a90dd039a20b24bddb41/models/lightASD.onnx and https://raw.githubusercontent.com/tiwater/Light-ASD/77e9d191faa17e8aac08a90dd039a20b24bddb41/models/lossAV.onnx . Fork license: https://raw.githubusercontent.com/tiwater/Light-ASD/77e9d191faa17e8aac08a90dd039a20b24bddb41/LICENSE .
6. AVA dataset paper, visible/audible distinction and offscreen/motion limitations: https://arxiv.org/html/1901.01342v2 .
7. Alternative architecture and demo source inspected, not executed: https://github.com/TaoRuijie/TalkNet-ASD and https://arxiv.org/abs/2107.06592 .
8. Additional CPU-oriented implementations inspected but not adopted: https://github.com/sieve-community/fast-asd and https://github.com/huyyxy/DeepTalk-ASD . Hosted function dependencies/automatic multi-model downloads make their whole application packages a poor fit for this bounded local test. Their performance claims were not measured here.

Source coverage is primary implementation, academic paper and dataset documentation. No independent deployment review or general comparative ranking is asserted.
