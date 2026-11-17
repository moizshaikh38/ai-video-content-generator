import unittest
from detector_geometry import visible_detector_rect as clip

class DetectorGeometryTests(unittest.TestCase):
    def test_visible_interior_unchanged(self):
        self.assertEqual(clip((10,20,30,40),100,100),(10,20,30,40))
    def test_observed_top_edge_face_retains_visible_part(self):
        self.assertEqual(clip((417,-4,227,332),854,480),(417,0,227,328))
    def test_all_edges_bounded(self):
        for rect in [(-2,30,20,20),(90,30,20,20),(30,-2,20,20),(30,90,20,20)]:
            x,y,w,h=clip(rect,100,100)
            self.assertGreaterEqual(x,0);self.assertGreaterEqual(y,0)
            self.assertLessEqual(x+w,100);self.assertLessEqual(y+h,100)
    def test_outside_or_mostly_hidden_rejected(self):
        for rect in [(-30,0,20,20),(-19,0,20,20),(101,0,20,20),(0,101,20,20)]:
            self.assertIsNone(clip(rect,100,100))
    def test_invalid_rejected(self):
        for rect in [(0,0,0,20),(0,0,-2,20),(float('nan'),0,20,20),(0,float('inf'),20,20)]:
            self.assertIsNone(clip(rect,100,100))
    def test_rounds_inward(self):
        self.assertEqual(clip((10.1,20.2,30.5,40.5),100,100),(11,21,29,39))

if __name__=='__main__':unittest.main()
