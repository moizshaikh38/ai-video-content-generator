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
