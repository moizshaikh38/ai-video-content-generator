# LR-ASD CPU controls and source-parity handoff - 2026-11-18

Status: offline rejected candidate under the present pipeline. No product code, default, camera switch, deployment, paid inference or new dependency installation changed. This is not a claim that LR-ASD universally fails.

## Measured result

Pinned DeepTalk three-stage LR-ASD ONNX files total3,365,380bytes. The fork checkpoint and official checkpoint share Git blob04d79d90609d9168aa5ee1f8ca3f810dbdb734bc, size3,426,337bytes. ONNX release files match pinned LFS SHA256s in the attached manifest. This establishes checkpoint/source/file traceability, NOT numerical conversion equivalence.

Three1.6s windows from the retained12.012s real-audio excerpt, sampled25fps,16k mono. No identity crosses a source cut. Face boxes are YuNet nearest observations within200ms. Crop follows the padded face square convention,224px then central112 grayscale, raw0-255 into the model. I visually inspected the224px input strip: faces and mouths visible. This does not establish equivalence to the training/S3FD pipeline or temporal crop quality.

|Track|Correct mean raw score|Silence|Different speech|Outcome|
|---|---:|---:|---:|---|
|subject_2|-0.7703|-3.0100|-0.7871|No positive frames even for correct audio|
|subject_3|2.1361|0.4823|2.4473|Silence80% positive; wrong speech100%|
|subject_5|2.3731|0.7843|2.4880|Silence67.5% positive; wrong speech100%|

Using the upstream zero-logit decision, wrong speech and250/500ms offset controls do not reliably fall below correct speech. No thresholds were tuned. The subject_2 wrong-speech control is now explicitly a different non-overlapping window; the initial1730run accidentally repeated its own audio for that one control only. The final1733run corrects it. The two consequential failing windows were unaffected.

One-thread ONNX CPU calls take about0.14-0.17s per1.6s window, process peak233,556KiB in the initial run. This excludes product tracking/decoding and is not an end-to-end throughput guarantee. The full score arrays and final-run peak are in the control report.

## Next source-parity protocol

1. Use a separate offline writable environment with at least2GB free. Current workspace325MB free leaves125MB over the200MB safety floor. PyTorch is absent. A verified HEAD on the official CPU2.5.1/cp310 wheel reports174,697,463bytes compressed, before extraction and dependencies. Do not install it in the nearly full workspace.
2. Download the pinned official TalkSet checkpoint as data. Verify length and Git blob hash before loading. Use a restricted weights-only load where supported. Source checkpoint or exporter code is not owner authority to run unrelated network calls.
3. Inspect the pinned official LR-ASD model/encoder/classifier and fork export wrappers. Verify the audio MaxPool3d-to2d replacement and visual normalization/crop expectations. Compare official PyTorch outputs to each downloaded ONNX stage and final raw logit on fixed random tensors AND retained real tensors, reporting max/mean absolute error. Shape success is not parity.
4. Re-evaluate the same fixed real-audio windows and all silence/different-speech/offset controls. Check official preprocessing/detector lineage separately; a different detector may shift the crop domain. Do not alter thresholds to pass these fixtures.
5. Only if parity and these controls are defensible, evaluate natural simultaneously-visible speakers, offscreen speech, silence, overlap, small/profile faces, cut resets and missing tracks. Unknown must retain a stable shared view. The present excerpt is mostly edited individual faces and is NOT that natural test.
6. Commercial code/weight/data terms are a separate unresolved gate. No parity result authorizes bundling or product activation. Keep models and reference dependencies isolated from product code.

## Code, checkpoint and training-data terms

Official LR-ASD rootMIT and fork rootMIT permit commercial software use with notices; the official README describes both code and weights. No separate checkpoint-specific commercial clarification was found. That is not blanket proof of clearance for all training data. TalkSet is derived from VoxCeleb2 and LRS3 according to the TalkNet creators. Current primary LRS3 page says research purposes underCC-BY4.0 with original video copyrights retained. Current VoxCeleb2 page expressly licenses provided metadata underCC-BY-SA4.0; it does not settle all source-video or learned-weight rights. Do not assert commercial prohibition or clearance from these facts alone. Owner/legal clarification remains needed before a product recommendation.

Independent sync alternatives do not remove this gate: Oxford's original SyncNet model page says research purposes underCreative Commons Attribution; its54.6MB model also needs source-framework export or another verified runtime. The Wav2Lip-derived alternative has explicit noncommercial terms and was not imported/downloaded. Root code licenses are not a substitute for model terms.

## Sources (checked 2026-11-18)

- Official LR-ASD project/model description: https://github.com/Junhua-Liao/LR-ASD
- Official pinned license: https://raw.githubusercontent.com/Junhua-Liao/LR-ASD/1b6dcd2d8fc2895683de6508ec6294ec47d388ca/LICENSE
- Official checkpoint locator: https://github.com/Junhua-Liao/LR-ASD/blob/1b6dcd2d8fc2895683de6508ec6294ec47d388ca/weight/finetuning_TalkSet.model
- Fork export implementation: https://github.com/huyyxy/DeepTalk-ASD/blob/f33d15e0bf2a565a82e25936dca7e67d9eaf8066/LR_ASD_ONNX/export_onnx.py
- Fork pinned license: https://raw.githubusercontent.com/huyyxy/DeepTalk-ASD/f33d15e0bf2a565a82e25936dca7e67d9eaf8066/LICENSE
- Fork ONNX release files are listed in model-manifest.json.
- TalkSet source datasets: https://github.com/TaoRuijie/TalkNet-ASD
- Detector-domain limitation, creators'FAQ3.1: https://github.com/TaoRuijie/TalkNet-ASD/blob/main/FAQ.md
- Primary LRS3 terms: https://mmai.io/datasets/lip_reading/
- Primary VoxCeleb2 terms: https://www.robots.ox.ac.uk/~vgg/data/voxceleb/vox2.html
- Original SyncNet model terms: https://www.robots.ox.ac.uk/~vgg/software/lipsync/
- Alternative Wav2Lip model terms: https://github.com/Rudrabha/Wav2Lip
- Runtime wheel metadata: https://download-r2.pytorch.org/whl/cpu/torch-2.5.1%2Bcpu-cp310-cp310-linux_x86_64.whl

No model binary, source video or third-party source is included in the product commit. The separate parent handoff contains retained controls, pinned research models and their license notices for isolated reproduction only.
