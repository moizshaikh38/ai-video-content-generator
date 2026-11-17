import unittest
from sample_clock import sample_relative_time
class SampleClockTest(unittest.TestCase):
 def test_fractional_trim_shares_cut_origin(self):
  fps=24000/1001;start=90;first=round(start*fps);boundary=round(2278/fps-start,6)
  self.assertEqual(sample_relative_time(first,fps,start),.006583)
  self.assertLess(sample_relative_time(2277,fps,start),boundary)
  self.assertGreaterEqual(sample_relative_time(2278,fps,start),boundary)
  # Previous first-frame-relative clock puts a next-shot sample before cut.
  self.assertLess(round((2278-first)/fps,3),boundary)
 def test_frame_aligned_zero_and_integer_trim_are_unchanged(self):
  for start in [0,1,12]:
   for n in [0,1,6,30]:self.assertEqual(sample_relative_time(start*30+n,30,start),round(n/30,6))
 def test_previous_rounded_frame_clamps_only_at_start(self):
  self.assertEqual(sample_relative_time(0,30,.01),0)
  self.assertEqual(sample_relative_time(1,30,.01),.023333)
 def test_invalid_fps_rejected(self):
  for fps in [0,-1,float('nan')]:
   with self.assertRaises(ValueError):sample_relative_time(1,fps,0)
if __name__=='__main__':unittest.main()
