"""Deterministic identity-support controls. Requires existing OpenCV install."""
import os,tempfile,unittest
import cv2,numpy as np
from track_subject import track,seed

class ManualTrackerControls(unittest.TestCase):
 def run_control(self,kind):
  rng=np.random.default_rng(914);W,H,FPS,N=400,240,24,144
  bg=rng.integers(30,150,(H,W,3),dtype=np.uint8);obj=rng.integers(150,255,(80,44,3),dtype=np.uint8)
  with tempfile.TemporaryDirectory()as temp:
   path=os.path.join(temp,'control.avi');writer=cv2.VideoWriter(path,cv2.VideoWriter_fourcc(*'MJPG'),FPS,(W,H));self.assertTrue(writer.isOpened());truth=[]
   for n in range(N):
    pan=kind=='pan';x=int(100+n*.35)if pan else int(80+n*.9);y=95
    frame=np.roll(bg,-int(n*.4),axis=1).copy()if pan else bg.copy()
    if kind!='occlusion'or n<60:frame[y:y+80,x:x+44]=np.full_like(obj,210)if kind=='lowtexture'else obj
    writer.write(frame);truth.append((x+22)/W)
   writer.release();x0=100 if kind=='pan'else 80
   out=track(dict(videoPath=path,refTime=0,startSec=0,endSec=N/FPS,box=dict(x=(x0-20)/W,y=80/H,w=84/W,h=110/H)))
  errors=[abs(k['centerX']-truth[min(N-1,round(k['time']*FPS))])for k in out['keyframes']if kind!='occlusion'or k['time']<2.5]
  self.assertLess(max(errors),.02,'center must not migrate onto textured background')
  return out
 def test_textured_subject_does_not_false_stop(self):
  r=self.run_control('textured');self.assertIsNone(r['lost_after']);self.assertGreaterEqual(r['tracked_to'],5.8)
 def test_panning_camera_does_not_false_stop(self):
  r=self.run_control('pan');self.assertIsNone(r['lost_after']);self.assertGreaterEqual(r['tracked_to'],5.8)
 def test_padded_lowtexture_subject_not_outvoted_by_background(self):
  r=self.run_control('lowtexture');self.assertIsNone(r['lost_after']);self.assertGreaterEqual(r['tracked_to'],5.8)
 def test_disappearance_stops_instead_of_adopting_background(self):
  r=self.run_control('occlusion');self.assertEqual(r['lost_after'],2.5);self.assertLess(r['tracked_to'],2.5)
 def test_seed_excludes_padding_and_abstains_without_subject_features(self):
  a=np.zeros((120,160),dtype=np.uint8);rng=np.random.default_rng(2);a[:]=rng.integers(0,255,a.shape,dtype=np.uint8);a[20:100,40:120]=128
  self.assertIsNone(seed(a,[30,10,100,100]))

 def test_no_reference_sample_is_invented_for_invalid_decoded_range(self):
  with tempfile.TemporaryDirectory()as temp:
   path=os.path.join(temp,'short.avi');w=cv2.VideoWriter(path,cv2.VideoWriter_fourcc(*'MJPG'),8,(160,120));self.assertTrue(w.isOpened())
   for n in range(8):w.write(np.full((120,160,3),n*20,dtype=np.uint8))
   w.release()
   for ref,start,end in [(2,0,3),(.5,.8,1),(1,0,1)]:
    with self.assertRaisesRegex(ValueError,'inside'):track(dict(videoPath=path,refTime=ref,startSec=start,endSec=end,box=dict(x=.2,y=.2,w=.3,h=.4)))

if __name__=='__main__':unittest.main()
