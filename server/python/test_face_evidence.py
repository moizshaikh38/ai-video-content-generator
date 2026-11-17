import unittest
import numpy as np
from face_evidence import candidate_evidence
from yunet_pyramid import detect_candidates
from smart_reframe import apply_nms

class FaceEvidenceTests(unittest.TestCase):
 def test_raw_unclipped_geometry_and_landmarks_not_invented(self):
  e=candidate_evidence('opencv-yunet',[-2,3,50,60],100,100,.91347)
  self.assertEqual(e['raw_box'],[-2,3,50,60]);self.assertTrue(e['clipped']['left'])
  self.assertNotIn('landmarks',e);self.assertEqual(e['raw_score'],.91347)
  self.assertEqual(e['verification']['state'],'unknown')
 def test_yunet_landmarks_native_coordinates_scale_back_exactly(self):
  class Fake:
   def setInputSize(self,size):self.size=size
   def detect(self,image):
    k=self.size[0]/100
    return None,np.array([[-2*k,5*k,40*k,45*k,10*k,15*k,30*k,15*k,20*k,25*k,12*k,35*k,28*k,35*k,.912345]])
  faces=detect_candidates(Fake(),np.zeros((60,100,3),dtype=np.uint8),True)
  self.assertEqual(len(faces),3)
  for f in faces:
   e=f['face_evidence'];self.assertEqual(e['raw_box'],[-2,5,40,45]);self.assertTrue(e['clipped']['left']);self.assertEqual(e['landmarks'][2],{'name':'nose','x':20.,'y':25.});self.assertEqual(e['raw_score'],.912345)
  self.assertEqual(apply_nms(faces)[0]['face_evidence'],faces[0]['face_evidence'])
 def test_invalid_geometry_refused(self):
  for box in [[0,0,-1,2],[float('nan'),0,1,2]]:
   with self.assertRaises(ValueError):candidate_evidence('test',box,100,100)
if __name__=='__main__':unittest.main()
