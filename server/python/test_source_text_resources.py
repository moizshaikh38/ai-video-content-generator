import unittest,os
from unittest.mock import patch
from types import SimpleNamespace
import numpy as np
from source_text_regions import source_text_regions
class ResourceBounds(unittest.TestCase):
 def test_each_child_is_single_threaded_and_sequential_without_mutating_parent(self):
  with patch.dict(os.environ,{'OMP_THREAD_LIMIT':'8'}):
   with patch('source_text_regions.subprocess.run',return_value=SimpleNamespace(stdout='level\ttext\n')) as run:
    self.assertEqual(source_text_regions(np.zeros((100,200,3),dtype=np.uint8)),[])
   self.assertEqual(run.call_count,2)
   for c in run.call_args_list:
    self.assertEqual(c.kwargs['env']['OMP_THREAD_LIMIT'],'1');self.assertEqual(c.kwargs['timeout'],5);self.assertTrue(c.kwargs['check']);self.assertEqual(c.args[0][-3:],['--psm','11','tsv'])
   self.assertEqual(os.environ['OMP_THREAD_LIMIT'],'8')
 def test_deadline_limits_children_and_expired_budget_never_launches(self):
  import time
  from subprocess import TimeoutExpired
  with patch('source_text_regions.subprocess.run',return_value=SimpleNamespace(stdout='level\ttext\n')) as run:
   self.assertEqual(source_text_regions(np.zeros((100,200,3),dtype=np.uint8),deadline=time.monotonic()+.5),[])
   for c in run.call_args_list:self.assertGreater(c.kwargs['timeout'],0);self.assertLessEqual(c.kwargs['timeout'],.5)
  with patch('source_text_regions.subprocess.run') as run:
   with self.assertRaises(TimeoutError):source_text_regions(np.zeros((100,200,3),dtype=np.uint8),deadline=time.monotonic()-1)
   run.assert_not_called()
  with patch('source_text_regions.subprocess.run',side_effect=TimeoutExpired('tesseract',.1)):
   with self.assertRaises(TimeoutExpired):source_text_regions(np.zeros((100,200,3),dtype=np.uint8),deadline=time.monotonic()+.5)
if __name__=='__main__':unittest.main()
