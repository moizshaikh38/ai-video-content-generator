"""Small deterministic guards; model/real-media qualification is separate."""
import json, os, subprocess, sys, tempfile, unittest
import cv2
import numpy as np
from person_regions import PersonRegions

class PersonRegionTests(unittest.TestCase):
    def test_corrupt_model_rejected_before_loading(self):
        with tempfile.NamedTemporaryFile() as f:
            f.write(b'not a model');f.flush()
            with self.assertRaisesRegex(ValueError,'checksum mismatch'):
                PersonRegions(f.name)

    def test_letterbox_and_person_only_geometry(self):
        class Fake:
            def infer(self, frame):
                self_shape=frame.shape
                assert self_shape==(416,416,3)
                # 800x400 source: top=104, 416x208. One real person, one
                # non-person and one impossible out-of-frame padded region.
                return np.array([[104,156,312,312,.9,0], [0,0,416,416,.9,1], [0,0,10,20,.9,0]])
        p=PersonRegions.__new__(PersonRegions);p.model=Fake()
        r=p.infer(np.zeros((400,800,3),dtype=np.uint8))
        self.assertEqual(len(r),1)
        self.assertEqual(r[0],dict(x=.25,y=.25,width=.5,height=.75,confidence=.9))

    def test_missing_model_fails_without_silent_fallback(self):
        with self.assertRaises(FileNotFoundError):
            PersonRegions('/nonexistent/person-model.onnx')

if __name__=='__main__':unittest.main()
