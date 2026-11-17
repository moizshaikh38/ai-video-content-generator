import unittest, tempfile, os
from source_text_geometry import rectangles_from_polygons,coverage_record,TextGeometryRegions
class GeometryTests(unittest.TestCase):
 def test_tilted_full_corners_clamp_padding_no_words(self):
  r=rectangles_from_polygons([[(0,20),(90,10),(100,30),(10,40)]],[.9],100,100)[0]
  self.assertEqual(r['x'],0);self.assertEqual(r['width'],1);self.assertEqual(r['y'],.02);self.assertEqual(r['height'],.46);self.assertNotIn('text',r)
 def test_invalid_geometry_and_confidence_rejected(self):
  for points,score in [([(1,1)]*3,.9), ([(1,1)]*4,.1), ([(float('nan'),0)]*4,.9)]:self.assertEqual(rectangles_from_polygons([points],[score],100,100),[])
 def test_zero_detections_is_not_clearance(self):
  r=coverage_record([0,.5,1],2,0,['db']);self.assertEqual(r['status'],'sampled-incomplete');self.assertEqual(r['absence_means'],'unknown');self.assertEqual(r['max_unsampled_gap_seconds'],1)
  self.assertEqual(coverage_record([],12,0,[])['status'],'not-sampled')
 def test_untrusted_or_missing_weights_fail(self):
  with self.assertRaises(ValueError):TextGeometryRegions('/no-such-model')
  with tempfile.NamedTemporaryFile()as f:
   f.write(b'not model');f.flush()
   with self.assertRaises(ValueError):TextGeometryRegions(f.name)
if __name__=='__main__':unittest.main()
