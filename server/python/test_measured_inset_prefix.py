"""Pin exact old candidate order/scores while replacing repeated slices with prefixes.
Reference is the prior production candidates implementation, not a looser oracle.
No video, network or model is required for these regressions.
"""
import unittest
import cv2
import numpy as np
from measured_inset_review import candidates,PrefixCache

def reference_candidates(frame):
 h,w=frame.shape[:2]
 hsv=cv2.cvtColor(frame,cv2.COLOR_BGR2HSV)
 mask=((hsv[:,:,1]>160)&(hsv[:,:,2]>50)).astype(np.uint8)*255
 hs=[];vs=[]
 for orientation,kernel in [('h',(max(16,round(w*.04)),1)),('v',(1,max(16,round(h*.04))))]:
  opened=cv2.morphologyEx(mask,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,kernel))
  # Project each opened scanline independently. Connected contours can merge a
  # valid line with crossing scene content and hide it via a tall bounding box.
  evidence=np.flatnonzero((opened>0).sum(axis=1 if orientation=='h' else 0)>=(w*.06 if orientation=='h' else h*.06))
  groups=np.split(evidence,np.where(np.diff(evidence)>1)[0]+1)
  for g in groups:
   if len(g):
    if orientation=='h':hs.extend([int(g[0]),int(g[-1])])
    else:vs.extend([int(g[0]),int(g[-1])])
 hs=sorted(set(hs));vs=sorted(set(vs))
 out=[];band=max(2,round(min(w,h)*.006))
 # Saturation alone also fills circles, solid UI cards and clothing. A border
 # needs a repeated color discontinuity normal to all four proposed sides.
 pixels=frame.astype(np.int16)
 gx=np.max(np.abs(pixels[:,1:]-pixels[:,:-1]),axis=2)>35
 gy=np.max(np.abs(pixels[1:]-pixels[:-1]),axis=2)>35
 for ai,x in enumerate(vs):
  for xx in vs[ai+1:]:
   rw=xx-x
   if not .06<=rw/w<=.5:continue
   for bi,y in enumerate(hs):
    for yy in hs[bi+1:]:
     rh=yy-y
     if not(.06<=rh/h<=.5 and .008<=rw*rh/(w*h)<=.2 and .6<=rw/rh<=2.4):continue
     strips=[mask[max(0,y-band):min(h,y+band+1),x:xx].max(0),mask[max(0,yy-band):min(h,yy+band+1),x:xx].max(0),mask[y:yy,max(0,x-band):min(w,x+band+1)].max(1),mask[y:yy,max(0,xx-band):min(w,xx+band+1)].max(1)]
     score=float(min((z>0).mean()for z in strips))
     if score<.85:continue
     edges=[gy[max(0,y-band):min(h-1,y+band+1),x:xx].max(0),gy[max(0,yy-band):min(h-1,yy+band+1),x:xx].max(0),gx[y:yy,max(0,x-band):min(w-1,x+band+1)].max(1),gx[y:yy,max(0,xx-band):min(w-1,xx+band+1)].max(1)]
     edge_score=float(min(z.mean()for z in edges))
     if edge_score<.7:continue
     r={'x':x/w,'y':y/h,'w':rw/w,'h':rh/h,'side_coverage':score,'edge_coverage':edge_score}
     out.append(r)
 return out


class PrefixEquivalence(unittest.TestCase):
 def test_exact_candidate_order_and_scores(self):
  rng=np.random.default_rng(1705)
  frames=[np.zeros((96,160,3),dtype=np.uint8)]
  for hue in [0,40,100,160]:
   frame=np.zeros((96,160,3),dtype=np.uint8)
   color=tuple(int(v) for v in cv2.cvtColor(np.uint8([[[hue,255,230]]]),cv2.COLOR_HSV2BGR)[0,0])
   cv2.rectangle(frame,(1,1),(62,55),color,3)
   cv2.rectangle(frame,(85,37),(146,90),color,2)
   frames.append(frame)
  frames.extend(rng.integers(0,256,(96,160,3),dtype=np.uint8)for _ in range(6))
  grid=np.zeros((120,200,3),dtype=np.uint8)
  for x in range(0,200,9):cv2.line(grid,(x,0),(x,119),(0,255,0),2)
  for y in range(0,120,8):cv2.line(grid,(0,y),(199,y),(0,255,0),2)
  frames.append(grid)
  for i,frame in enumerate(frames):
   with self.subTest(frame=i):self.assertEqual(candidates(frame),reference_candidates(frame))

class PrefixMemoryBound(unittest.TestCase):
 def test_hd_4k_band_arrays_stay_bounded_without_rectangle_search(self):
  cache=PrefixCache()
  for width in [1920,3840,7680]:
   for i in range(1500):
    value=cache.get((width,i),lambda:(np.zeros(width+1,dtype=np.int64),np.ones(width+1,dtype=np.int64)))
    self.assertEqual(value[1][-1],1)
    self.assertLessEqual(cache.bytes,8*1024*1024)
  self.assertLessEqual(cache.peak_bytes,8*1024*1024)
 def test_eviction_and_uncached_oversized_rows_preserve_values(self):
  cache=PrefixCache(64)
  a=cache.get('a',lambda:(np.array([1,2],dtype=np.int64),))
  cache.get('b',lambda:(np.arange(8,dtype=np.int64),))
  self.assertEqual(cache.get('a',lambda:(np.array([1,2],dtype=np.int64),))[0].tolist(),a[0].tolist())
  cache.get('oversized',lambda:(np.arange(100,dtype=np.int64),))
  self.assertLessEqual(cache.bytes,64)
  self.assertNotIn('oversized',cache.rows)

if __name__=='__main__':unittest.main()
