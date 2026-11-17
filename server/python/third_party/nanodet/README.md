# Local NanoDet person-region candidate

Upstream inference `nanodet.py`, retained under Apache-2.0:
https://huggingface.co/opencv/object_detection_nanodet/resolve/main/nanodet.py
Model card: https://huggingface.co/opencv/object_detection_nanodet
License: LICENSE in this directory, fetched with the upstream source.

The model binary is NOT committed or downloaded at runtime. For local qualification,
download `object_detection_nanodet_2022nov.onnx` from that model repository and set
`SMART_REFRAME_PERSON_MODEL` to the local file. The wrapper rejects any model except
SHA-256 `4b82da9944b88577175ee23a459dce2e26e6e4be573def65b1055dc2d9720186`
(3,800,954 bytes). It runs OpenCV DNN with 2 CPU threads and confidence 0.4.

With no model setting, the analyzer does not add person measurements. With an
explicit missing/corrupt/wrong model it fails rather than claiming successful
person evidence. This candidate does not establish a deployment dependency or
change default detection. Package/model/license/concurrency qualification is
required before considering release.

Measured person boxes have known misses and false positives. Only repeated,
face-associated, non-ambiguous boxes may inform the candidate composition. A body
box does not prove an active speaker or preserve occluded or source-cut-off limbs.

## Experimental object constraints

`SMART_REFRAME_OBJECT_CONTEXT=1` retains non-person boxes from this same model,
without another inference or a new model download. Only confidence >=0.7 boxes
are recorded; the composition planner additionally needs at least six samples,
the same class present in at least half the samples (minimum three), valid
coordinates and non-tiny area. Class IDs are not exposed as semantic labels.
These regions can only constrain/widen a crop, never grant an unknown scene
permission to use Fill or establish that an object is narratively important.

A bounded 40.309s Beast test produced only two non-person boxes across 173
samples and zero persistent object constraints. This model is not qualified as
a general scene-understanding model. The flag remains opt-in; no default
production behavior, deployment model requirement or licensing claim changed.
