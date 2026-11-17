import unittest,numpy as np
from yunet_pyramid import inference_sizes,detect_candidates
class PyramidTests(unittest.TestCase):
 def test_bounded_only_second_lowres_inference(self):
  self.assertEqual(inference_sizes(854,480),[(854,480)])
  self.assertEqual(inference_sizes(854,480,True),[(854,480),(1281,720),(1708,960)])
  self.assertEqual(inference_sizes(1920,1080,True),[(1920,1080)])
  self.assertEqual(inference_sizes(3840,2160,True),[(3840,2160)])
 def test_exact_native_mapping_scaled_to_source_and_input_restored(self):
  class Fake:
   def setInputSize(self,size):self.size=size
   def detect(self,image):
    k=self.size[0]/100
    return None,np.array([[10*k,20*k,30*k,40*k,.91]])
  m=Fake();r=detect_candidates(m,np.zeros((60,100,3),dtype=np.uint8),True)
  self.assertEqual([x['rect']for x in r],[(10,20,30,40)]*3);self.assertEqual(m.size,(100,60));self.assertEqual(r[0]['confidence'],.91)
 def test_no_detection_does_not_create_face(self):
  class Fake:
   def setInputSize(self,s):pass
   def detect(self,f):return None,None
  self.assertEqual(detect_candidates(Fake(),np.zeros((100,100,3),dtype=np.uint8),True),[])
if __name__=='__main__':unittest.main()
