"""Offline inset evidence uses exactly its selected source interval."""
import unittest,tempfile,os
from unittest.mock import patch
import numpy as np
import measured_inset_review as m
class Capture:
 def __init__(self,*args):self.seeks=[];self.released=False;captures.append(self)
 def get(self,k):return 720 if k==m.cv2.CAP_PROP_FRAME_COUNT else 60
 def set(self,k,v):self.seeks.append(v)
 def read(self):return True,np.zeros((540,960,3),dtype=np.uint8)
 def release(self):self.released=True
captures=[]
class Scope(unittest.TestCase):
 def setUp(self):
  self.f=tempfile.NamedTemporaryFile(delete=False);self.f.write(b'scope-unit-fixture');self.f.close();self.addCleanup(os.unlink,self.f.name)
 def test_exact_selected_clock_and_no_semantic_upgrade(self):
  track={'raw_samples':[{'time':.25*i,'faces':[]}for i in range(18)]}
  with patch.object(m.cv2,'VideoCapture',Capture),patch.object(m,'candidates',return_value=[]):r=m.run(self.f.name,track,.18,4.34)
  self.assertEqual(len(captures[-1].seeks),8);self.assertAlmostEqual(captures[-1].seeks[0],180);self.assertAlmostEqual(captures[-1].seeks[-1],4420)
  self.assertEqual(r['source_start'],.18);self.assertAlmostEqual(r['source_end'],4.52);self.assertTrue(r['not_genre_proof']);self.assertTrue(r['not_real_person_proof']);self.assertEqual(r['status'],'unresolved');self.assertEqual(r['observations'][0]['time'],0);self.assertEqual(r['observations'][0]['source_time'],.18)
 def test_out_of_scope_face_samples_rejected_before_decode(self):
  for time in [-.01,4.34,12,float('nan')]:
   with self.subTest(time=time),patch.object(m.cv2,'VideoCapture',Capture),self.assertRaises(ValueError):m.run(self.f.name,{'raw_samples':[{'time':time,'faces':[]}]},.18,4.34)
   self.assertEqual(captures[-1].seeks,[]);self.assertTrue(captures[-1].released)
 def test_invalid_intervals_rejected(self):
  for start,duration in [(-1,4),(0,0),(10,4),(float('nan'),2),(.18,float('inf'))]:
   with self.subTest(start=start,duration=duration),patch.object(m.cv2,'VideoCapture',Capture),self.assertRaises(ValueError):m.run(self.f.name,{'raw_samples':[]},start,duration)
   self.assertTrue(captures[-1].released)
 def test_full_source_backwards_compatible(self):
  with patch.object(m.cv2,'VideoCapture',Capture),patch.object(m,'candidates',return_value=[]):r=m.run(self.f.name,{'raw_samples':[]})
  self.assertEqual(r['source_start'],0);self.assertEqual(r['source_end'],12);self.assertEqual(len(r['observations']),13)
 def test_small_nested_border_not_discarded_before_outer_comparison(self):
  inner={'x':.02,'y':.5,'w':.18,'h':.24,'side_coverage':.98,'edge_coverage':.95};outer={'x':.012,'y':.495,'w':.196,'h':.25,'side_coverage':.99,'edge_coverage':.95}
  faces=[{'x':.06,'y':.55,'width':.05,'height':.08,'confidence':.9,'track_id':'a'}]
  with patch.object(m.cv2,'VideoCapture',Capture),patch.object(m,'candidates',return_value=[inner,outer]):r=m.run(self.f.name,{'raw_samples':[{'time':i*.25,'faces':faces}for i in range(18)]},.18,4.34)
  self.assertEqual(r['status'],'measured-rectangle');self.assertAlmostEqual(r['proposals'][0]['box']['w'],outer['w'])
 def test_source_clock_unavailable_releases_capture(self):
  class BadClock(Capture):
   def get(self,k):return 0
  with patch.object(m.cv2,'VideoCapture',BadClock),self.assertRaises(ValueError):m.run(self.f.name,{'raw_samples':[]},.18,4.34)
  self.assertTrue(captures[-1].released)
 def test_known_face_interval_must_match_not_relabel_whole_source(self):
  for field,value in [('analyzed_source_start',0),('analyzed_source_end',12),('clip_duration',12)]:
   with self.subTest(field=field),patch.object(m.cv2,'VideoCapture',Capture),self.assertRaises(ValueError):m.run(self.f.name,{'raw_samples':[],'metadata':{field:value}},.18,4.34)
   self.assertEqual(captures[-1].seeks,[]);self.assertTrue(captures[-1].released)
 def test_matching_known_interval_accepted(self):
  with patch.object(m.cv2,'VideoCapture',Capture),patch.object(m,'candidates',return_value=[]):r=m.run(self.f.name,{'raw_samples':[],'metadata':{'analyzed_source_start':.18,'analyzed_source_end':4.52,'clip_duration':4.34}},.18,4.34)
  self.assertEqual(r['source_start'],.18)
 def test_actual_blank_and_unbordered_frames_have_no_rectangle(self):
  self.assertEqual(m.candidates(np.zeros((180,320,3),dtype=np.uint8)),[])
  frame=np.zeros((180,320,3),dtype=np.uint8);m.cv2.circle(frame,(50,100),15,(0,200,200),-1)
  self.assertEqual(m.candidates(frame),[])
 def test_rectangle_candidates_generalize_hue_and_position_not_semantics(self):
  for x,y,hue in [(20,90,10),(210,20,70),(110,50,150)]:
   with self.subTest(hue=hue):
    frame=np.zeros((180,320,3),dtype=np.uint8);hsv=np.uint8([[[hue,255,230]]]);color=tuple(int(v)for v in m.cv2.cvtColor(hsv,m.cv2.COLOR_HSV2BGR)[0,0]);m.cv2.rectangle(frame,(x,y),(x+70,y+50),color,3)
    rs=m.candidates(frame);self.assertTrue(any(abs(r['x']-x/320)<.025 and abs(r['y']-y/180)<.025 and abs(r['w']-70/320)<.025 and abs(r['h']-50/180)<.025 for r in rs))
 def test_multiple_supported_rectangles_remain_ambiguous(self):
  boxes=[{'x':.02,'y':.5,'w':.18,'h':.24,'side_coverage':.98},{'x':.7,'y':.1,'w':.18,'h':.24,'side_coverage':.98}]
  faces=[{'x':.06,'y':.55,'width':.05,'height':.08,'confidence':.9,'track_id':'left'},{'x':.74,'y':.15,'width':.05,'height':.08,'confidence':.9,'track_id':'right'}]
  track={'raw_samples':[{'time':i*.25,'faces':faces}for i in range(18)]}
  with patch.object(m.cv2,'VideoCapture',Capture),patch.object(m,'candidates',return_value=boxes):r=m.run(self.f.name,track,.18,4.34)
  self.assertEqual(r['status'],'unresolved');self.assertEqual(len(r['proposals']),2)
 def test_rectangle_without_contained_face_does_not_establish_inset(self):
  boxes=[{'x':.02,'y':.5,'w':.18,'h':.24,'side_coverage':.98}]
  faces=[{'x':.6,'y':.3,'width':.12,'height':.2,'confidence':.99,'track_id':'outside'}]
  with patch.object(m.cv2,'VideoCapture',Capture),patch.object(m,'candidates',return_value=boxes):r=m.run(self.f.name,{'raw_samples':[{'time':i*.25,'faces':faces}for i in range(18)]},.18,4.34)
  self.assertEqual(r['status'],'unresolved');self.assertEqual(r['proposals'],[])
 def test_face_inside_persistent_rectangle_is_still_not_real_person_proof(self):
  # A framed poster or game UI can meet geometry; explicitly keep this limit.
  boxes=[{'x':.02,'y':.5,'w':.18,'h':.24,'side_coverage':.98}]
  faces=[{'x':.06,'y':.55,'width':.05,'height':.08,'confidence':.9,'track_id':'candidate'}]
  with patch.object(m.cv2,'VideoCapture',Capture),patch.object(m,'candidates',return_value=boxes):r=m.run(self.f.name,{'raw_samples':[{'time':i*.25,'faces':faces}for i in range(18)]},.18,4.34)
  self.assertEqual(r['status'],'measured-rectangle');self.assertTrue(r['not_real_person_proof']);self.assertTrue(r['not_genre_proof'])
if __name__=='__main__':unittest.main()
