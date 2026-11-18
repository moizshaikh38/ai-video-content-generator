"""Admission for bounded ordinary Auto text measurements, never crop clearance."""
import math,os,time,tempfile,shutil
from contextlib import contextmanager

def eligible(duration,width,height,fps):
 return all(math.isfinite(v)for v in [duration,width,height,fps]) and 0<duration<=12 and 0<width<=1280 and 0<height<=720 and 0<fps<=60 and duration*fps<=720

@contextmanager
def host_ocr_slot():
 # OS releases the slot even if the process is killed. Nonblocking: another
 # render must not wait behind optional OCR. No lock means no text-free claim.
 import fcntl
 with open(os.path.join(tempfile.gettempdir(),'vireo-auto-text-v1.lock'),'a')as f:
  try:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:
   yield False;return
  try:yield True
  finally:fcntl.flock(f,fcntl.LOCK_UN)

class AutoTextBudget:
 def __init__(self,requested,duration,width,height,fps):
  self.spent=0.;self.count=0;self.limit=20.;self.max_samples=24
  self.record={'requested':requested is True,'status':'not-requested','max_samples':24,'time_budget_seconds':20,'sampling_interval_seconds':.49,'absence_means':'unknown'}
  if requested is not True:return
  if os.environ.get('SMART_REFRAME_AUTO_TEXT','')=='0':self.record['status']='disabled';return
  if not eligible(duration,width,height,fps):self.record['status']='skipped-budget';return
  if not shutil.which('tesseract'):self.record['status']='unavailable';return
  self.record['status']='admitted'
 def run(self,frame):
  if self.record['status']not in ['admitted','sampled-incomplete']:return None
  if self.count>=self.max_samples or self.spent>=self.limit:self.record['status']='stopped-budget';return None
  start=time.monotonic()
  try:
   with host_ocr_slot()as held:
    if not held:self.record['status']='skipped-busy';return None
    from source_text_regions import source_text_regions
    regions=source_text_regions(frame,include_word_candidates=True,deadline=time.monotonic()+self.limit-self.spent)
   self.count+=1;self.record['status']='sampled-incomplete';return regions
  except Exception as e:
   self.record['status']='failed-incomplete';self.record['failure_type']=type(e).__name__;return None
  finally:
   self.spent+=time.monotonic()-start;self.record['elapsed_ocr_seconds']=round(self.spent,3);self.record['sample_count']=self.count
