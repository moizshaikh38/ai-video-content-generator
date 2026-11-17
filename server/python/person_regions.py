"""Experimental local person boxes, not semantic speaker or safe-crop proof.

OpenCV Zoo NanoDet model and inference: Apache-2.0, see third_party/nanodet.
No downloads at runtime. Explicit model opt-in; absent model means no evidence.
"""
import hashlib
import cv2
import numpy as np
from third_party.nanodet.nanodet import NanoDet

MODEL_SHA256 = '4b82da9944b88577175ee23a459dce2e26e6e4be573def65b1055dc2d9720186'

class PersonRegions:
    def __init__(self, model_path):
        cv2.setNumThreads(2)  # Candidate CPU work is bounded and serial.
        with open(model_path, 'rb') as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        if digest != MODEL_SHA256:
            raise ValueError('Person-region model checksum mismatch; use documented OpenCV Zoo NanoDet model')
        self.model = NanoDet(model_path, prob_threshold=.4)

    def infer_with_context(self, frame):
        h, w = frame.shape[:2]
        ratio = min(416 / w, 416 / h)
        nw, nh = max(1, int(w * ratio)), max(1, int(h * ratio))
        left, top = (416-nw)//2, (416-nh)//2
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA)
        padded = cv2.copyMakeBorder(rgb, top, 416-nh-top, left, 416-nw-left, cv2.BORDER_CONSTANT, value=0)
        result = []
        objects = []
        for p in self.model.infer(padded):
            x0, y0 = max(0., (p[0]-left)/nw), max(0., (p[1]-top)/nh)
            x1, y1 = min(1., (p[2]-left)/nw), min(1., (p[3]-top)/nh)
            if x1 <= x0 or y1 <= y0:
                continue
            region = {'x':round(float(x0),4), 'y':round(float(y0),4),
                           'width':round(float(x1-x0),4), 'height':round(float(y1-y0),4),
                           'confidence':round(float(p[-2]),4)}
            if int(p[-1]) == 0:
                result.append(region)
            elif float(p[-2]) >= .7:
                objects.append({**region, 'class_id':int(p[-1])})
        return result, objects

    def infer(self, frame):
        return self.infer_with_context(frame)[0]
