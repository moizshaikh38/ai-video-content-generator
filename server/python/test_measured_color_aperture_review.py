import unittest,cv2,numpy as np,tempfile,os
from measured_color_aperture_review import apertures,run

class ClosedApertureReviewTests(unittest.TestCase):
 def frame(self):return np.full((200,320,3),40,np.uint8)
 def ring(self,f,x,y,hue=60):
  color=cv2.cvtColor(np.uint8([[[hue,255,230]]]),cv2.COLOR_HSV2BGR)[0,0].tolist();cv2.rectangle(f,(x,y),(x+80,y+60),color,5)
 def test_colors_and_positions_are_not_fixed(self):
  for hue in [0,30,60,90,120,150]:
   for x,y in [(10,10),(200,100)]:
    f=self.frame();self.ring(f,x,y,hue);a=apertures(f);self.assertEqual(len(a),1,(hue,x,a));b=a[0]['box'];self.assertTrue(x/320<b['x']<(x+8)/320);self.assertTrue(y/200<b['y']<(y+8)/200)
 def test_no_open_filled_circle_or_blank_border(self):
  for kind in ['filled','circle','open','blank']:
   f=self.frame()
   if kind=='filled':cv2.rectangle(f,(10,10),(90,70),(0,255,0),-1)
   if kind=='circle':cv2.circle(f,(50,50),35,(0,255,0),5)
   if kind=='open':
    for a,b in [((10,70),(10,10)),((10,10),(90,10)),((90,10),(90,70))]:cv2.line(f,a,b,(0,255,0),5)
   self.assertEqual(apertures(f),[],kind)
 def video(self,frame,faces):
  with tempfile.TemporaryDirectory()as tmp:
   p=os.path.join(tmp,'source.mp4');w=cv2.VideoWriter(p,cv2.VideoWriter_fourcc(*'mp4v'),2,(320,200))
   for _ in range(12):w.write(frame)
   w.release();return run(p,{'raw_samples':[{'time':i*.5,'faces':faces}for i in range(12)]})
 def face(self,x,y,track):return {'x':x,'y':y,'width':.06,'height':.08,'confidence':.95,'track_id':track}
 def test_two_independent_rectangles_remain_ambiguous(self):
  f=self.frame();self.ring(f,10,10);self.ring(f,200,100,120);r=self.video(f,[self.face(.12,.12,'a'),self.face(.72,.62,'b')]);self.assertEqual(r['status'],'unresolved');self.assertGreaterEqual(len(r['proposals']),2) # Compression may split a boundary, but never choose one.
 def test_no_face_anchor_never_promotes_ui_rectangle(self):
  f=self.frame();self.ring(f,10,10);self.assertEqual(self.video(f,[])['status'],'unresolved')
 def test_source_clock_rejects_out_of_interval_samples(self):
  f=self.frame();self.ring(f,10,10)
  with tempfile.TemporaryDirectory()as tmp:
   p=os.path.join(tmp,'source.mp4');w=cv2.VideoWriter(p,cv2.VideoWriter_fourcc(*'mp4v'),2,(320,200))
   for _ in range(12):w.write(f)
   w.release()
   for t in [-1,6,float('nan')]:
    with self.assertRaises(ValueError):run(p,{'raw_samples':[{'time':t,'faces':[]}]})
 def test_pixel_budget_rejects_before_decoding(self):
  from unittest.mock import patch
  class Oversized:
   def get(self,field):return {cv2.CAP_PROP_FPS:30,cv2.CAP_PROP_FRAME_COUNT:600,cv2.CAP_PROP_FRAME_WIDTH:1080,cv2.CAP_PROP_FRAME_HEIGHT:1920}[field]
   def release(self):pass
   def read(self):raise AssertionError('Oversized source must not decode')
  with patch('measured_color_aperture_review.cv2.VideoCapture',return_value=Oversized()):
   with self.assertRaisesRegex(ValueError,'pixel budget'):run('/unused',{'raw_samples':[]})
if __name__=='__main__':unittest.main()
