"""Forward sparse-frame reader. Decode once instead of seeking each sample.

Opt-in only at the analyzer call site. Sparse low-rate/long-gap performance can
vary by codec; this helper makes no detector, sample-index or timestamp changes.
"""
import cv2

class SparseFrameReader:
 def __init__(self,cap):
  self.cap=cap
  self.next_index=None
 def read_at(self,index):
  if not isinstance(index,int)or index<0:raise ValueError('nonnegative integer frame index required')
  if self.next_index is None or index<self.next_index:
   if not self.cap.set(cv2.CAP_PROP_POS_FRAMES,index):return False,None
   self.next_index=index
  while self.next_index<=index:
   ok=self.cap.grab();self.next_index+=1
   if not ok:return False,None
  return self.cap.retrieve()
