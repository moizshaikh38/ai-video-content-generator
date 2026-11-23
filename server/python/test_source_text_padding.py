import unittest
from unittest.mock import patch
from types import SimpleNamespace
import numpy as np
from source_text_regions import source_text_regions
H='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'
class PaddingTests(unittest.TestCase):
 def test_lower_pass_padding_maps_to_original_edge_without_extra_children(self):
  # 200x100 -> lower pass300x75 +20px border. Glyph reaches bottom edge.
  t=H+'5\t1\t1\t1\t1\t1\t95\t80\t60\t15\t96\tALPHA\n'
  with patch('source_text_regions.subprocess.run',side_effect=[SimpleNamespace(stdout=H),SimpleNamespace(stdout=t)]) as run:
   r=source_text_regions(np.zeros((100,200,3),dtype=np.uint8),True)
  self.assertEqual(run.call_count,2);self.assertEqual(len(r),1)
  self.assertAlmostEqual(r[0]['x'],67/300);self.assertAlmostEqual(r[0]['y'],.8466666666666667)
  self.assertAlmostEqual(r[0]['y']+r[0]['height'],1);self.assertEqual(r[0]['confidence'],.96)
 def test_padding_only_detection_is_discarded(self):
  t=H+'5\t1\t1\t1\t1\t1\t0\t0\t5\t5\t96\tALPHA\n'
  with patch('source_text_regions.subprocess.run',side_effect=[SimpleNamespace(stdout=H),SimpleNamespace(stdout=t)]):
   self.assertEqual(source_text_regions(np.zeros((100,200,3),dtype=np.uint8),True),[])
if __name__=='__main__':unittest.main()
