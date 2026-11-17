import os,tempfile,unittest,subprocess
import cv2,numpy as np
from sparse_frame_reader import SparseFrameReader

class SparseReaderControls(unittest.TestCase):
 def test_exact_pixels_at_forward_trim_repeat_and_backward_indices(self):
  with tempfile.TemporaryDirectory()as temp:
   for fps in [24,30]:
    p=os.path.join(temp,str(fps)+'.avi');w=cv2.VideoWriter(p,cv2.VideoWriter_fourcc(*'MJPG'),fps,(160,120));self.assertTrue(w.isOpened());rng=np.random.default_rng(7)
    for n in range(120):w.write(rng.integers(0,255,(120,160,3),dtype=np.uint8))
    w.release();baseline=cv2.VideoCapture(p);cap=cv2.VideoCapture(p);reader=SparseFrameReader(cap)
    try:
     for index in [7,15,23,31,100,100,20,28,119,120]:
      baseline.set(cv2.CAP_PROP_POS_FRAMES,index);a,x=baseline.read();b,y=reader.read_at(index);self.assertEqual(a,b)
      if a:self.assertTrue(np.array_equal(x,y),str((fps,index)))
    finally:baseline.release();cap.release()
 def test_long_gop_fractional_fps_exact_pixels(self):
  with tempfile.TemporaryDirectory()as temp:
   for fps in ['24000/1001','30000/1001']:
    p=os.path.join(temp,fps.replace('/','-')+'.mp4')
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=s=320x180:r='+fps+':d=4','-c:v','libx264','-g','120','-bf','3','-threads','1',p],check=True)
    a=cv2.VideoCapture(p);b=cv2.VideoCapture(p);r=SparseFrameReader(b)
    try:
     for index in [7,15,23,31,79,79,20,28,95,119,120]:
      a.set(cv2.CAP_PROP_POS_FRAMES,index);ok,x=a.read();got,y=r.read_at(index);self.assertEqual(ok,got)
      if ok:self.assertTrue(np.array_equal(x,y),str((fps,index)))
    finally:a.release();b.release()
 def test_rejects_invalid_index(self):
  r=SparseFrameReader(None)
  for i in [-1,1.5,float('nan')]:
   with self.assertRaises(ValueError):r.read_at(i)

if __name__=='__main__':unittest.main()
