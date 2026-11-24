import unittest
from measured_capabilities import measured_capabilities
class CapabilityTests(unittest.TestCase):
 def test_no_inferred_semantics_or_absence(self):
  r=measured_capabilities(False,False,[{'faces':[]},{'faces':[{}]}])
  self.assertEqual(r['face_detector'],'opencv-haar');self.assertEqual(r['person_detector'],'not-configured');self.assertEqual(r['person_sample_count'],0);self.assertEqual(r['face_sample_count'],1);self.assertEqual(r['human_animation_classification'],'not-run')
 def test_actual_optional_detector_execution(self):
  r=measured_capabilities(True,True,[{'faces':[{}],'persons':[{}]},{'faces':[],'persons':[]}]);self.assertEqual(r['person_sample_count'],1);self.assertEqual(r['sample_count'],2);self.assertEqual(r['active_speaker_verification'],'not-run')
if __name__=='__main__':unittest.main()
