import unittest,os
from unittest.mock import patch
from auto_text_budget import eligible,AutoTextBudget,host_ocr_slot
class AutoTextTests(unittest.TestCase):
 def test_decoded_budget_rejects_large_long_invalid(self):
  self.assertTrue(eligible(12,1280,720,60))
  for args in [(12.01,960,540,30),(12,1920,1080,30),(12,1280,720,61),(0,960,540,30),(8,float('nan'),540,30)]:self.assertFalse(eligible(*args))
 def budget(self):return AutoTextBudget(True,8,960,540,30)
 @patch('auto_text_budget.shutil.which',return_value='/usr/bin/tesseract')
 def test_no_request_disabled_missing_and_nonblocking_lock(self,_):
  self.assertEqual(AutoTextBudget(False,8,960,540,30).record['status'],'not-requested')
  with patch.dict(os.environ,{'SMART_REFRAME_AUTO_TEXT':'0'}):self.assertEqual(self.budget().record['status'],'disabled')
  with host_ocr_slot()as first:
   self.assertTrue(first)
   with host_ocr_slot()as second:self.assertFalse(second)
 @patch('auto_text_budget.shutil.which',return_value=None)
 def test_missing_runtime_is_unknown(self,_):
  b=self.budget();self.assertEqual(b.record['status'],'unavailable');self.assertIsNone(b.run(None));self.assertEqual(b.record['absence_means'],'unknown')
 @patch('auto_text_budget.shutil.which',return_value='/usr/bin/tesseract')
 def test_sample_and_total_budgets_and_failure_do_not_claim_coverage(self,_):
  b=self.budget()
  with patch('source_text_regions.source_text_regions',return_value=[])as run:
   for i in range(24):self.assertEqual(b.run(None),[])
   self.assertIsNone(b.run(None));self.assertEqual(run.call_count,24);self.assertEqual(b.record['status'],'stopped-budget')
  b=self.budget();b.spent=20;self.assertIsNone(b.run(None));self.assertEqual(b.record['status'],'stopped-budget')
  b=self.budget()
  with patch('source_text_regions.source_text_regions',side_effect=TimeoutError):self.assertIsNone(b.run(None))
  self.assertEqual(b.record['status'],'failed-incomplete');self.assertEqual(b.record['sample_count'],0)
 @patch('auto_text_budget.shutil.which',return_value='/usr/bin/tesseract')
 def test_busy_and_partial_failure_preserve_unknown_and_completed_count(self,_):
  b=self.budget()
  with host_ocr_slot():self.assertIsNone(b.run(None))
  self.assertEqual(b.record['status'],'skipped-busy');self.assertEqual(b.record['sample_count'],0)
  b=self.budget()
  with patch('source_text_regions.source_text_regions',side_effect=[[],TimeoutError()]):
   self.assertEqual(b.run(None),[]);self.assertIsNone(b.run(None))
  self.assertEqual(b.record['status'],'failed-incomplete');self.assertEqual(b.record['sample_count'],1)
  self.assertIsNone(b.run(None));self.assertEqual(b.record['absence_means'],'unknown')
if __name__=='__main__':unittest.main()
