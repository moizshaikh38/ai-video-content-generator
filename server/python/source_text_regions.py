"""Offline review OCR constraints. Text existence, not importance or legibility.

Multi-word OCR lines become indivisible measured rectangles. No recognized
words are retained in records. Misses and false positives remain possible.
"""
import csv, io, subprocess, tempfile, os
import cv2

def regions_from_tsv(tsv,width,height,include_word_candidates=False):
 lines={}
 for row in csv.DictReader(io.StringIO(tsv),delimiter='\t'):
  if row.get('level')!='5' or not row.get('text','').strip():continue
  try:
   x,y,w,h=[int(row[k]) for k in ('left','top','width','height')];conf=float(row['conf'])
  except (ValueError,KeyError):continue
  if w<=0 or h<=0 or x<0 or y<0 or x+w>width or y+h>height:continue
  key=tuple(row.get(k,'')for k in ('page_num','block_num','par_num','line_num'))
  lines.setdefault(key,[]).append((x,y,w,h,conf,len(row['text'].strip())))
 result=[]
 for words in lines.values():
  strong=[v for v in words if v[4]>=70 and v[5]>=2]
  multiword=len(strong)>=2 and sum(v[5]for v in strong)>=8
  persistent_candidate=include_word_candidates and len(words)==1 and words[0][4]>=90 and words[0][5]>=4
  if not multiword and not persistent_candidate:continue
  # Include low-confidence words in that same measured line. Discarding them
  # could trim sentence ends even when the middle is confidently recognized.
  x=max(0,min(v[0]for v in words)-8);y=max(0,min(v[1]for v in words)-8)
  right=min(width,max(v[0]+v[2]for v in words)+8);bottom=min(height,max(v[1]+v[3]for v in words)+8)
  result.append(dict(x=x/width,y=y/height,width=(right-x)/width,height=(bottom-y)/height,confidence=min(v[4]for v in strong)/100,kind='ocr-multiword-line' if multiword else 'ocr-word-candidate'))
 return result

def source_text_regions(frame,include_word_candidates=False,deadline=None):
 h,w=frame.shape[:2];result=[]
 # Full scene plus a generic enlarged lower-half text pass. Neither route
 # knows the title, subtitle wording or source-specific position/appearance.
 for index,(image,offset,scale) in enumerate([(frame,0,1),(cv2.resize(frame[h//2:],None,fx=1.5,fy=1.5),h//2,1.5)]):
  ih,iw=image.shape[:2]
  # Keep source-edge glyphs away from the OCR canvas boundary. Reuse the
  # existing lower-half pass, not an extra child or weaker confidence gate.
  border=20 if index==1 else 0
  if border:image=cv2.copyMakeBorder(image,border,border,border,border,cv2.BORDER_CONSTANT,value=(255,255,255))
  oh,ow=image.shape[:2]
  with tempfile.TemporaryDirectory() as d:
   path=os.path.join(d,'frame.png');cv2.imwrite(path,image)
   # One OCR child at a time, one OpenMP thread in each child. Large default
   # thread pools cost CPU/memory on concurrent render hosts; this is a
   # resource bound, not a change to recognition or sampling thresholds.
   timeout=5 if deadline is None else min(5,deadline-__import__('time').monotonic())
   if timeout<=0:raise TimeoutError('OCR source budget exhausted')
   p=subprocess.run(['tesseract',path,'stdout','--psm','11','tsv'],capture_output=True,text=True,timeout=timeout,check=True,env={**os.environ,'OMP_THREAD_LIMIT':'1'})
  for r in regions_from_tsv(p.stdout,ow,oh,include_word_candidates):
   # Clip padded-canvas measurements before mapping to source coordinates.
   left=max(0,r['x']*ow-border);top=max(0,r['y']*oh-border)
   right=min(iw,(r['x']+r['width'])*ow-border);bottom=min(ih,(r['y']+r['height'])*oh-border)
   if right<=left or bottom<=top:continue
   r.update(x=left/scale/w,y=(top/scale+offset)/h,width=(right-left)/scale/w,height=(bottom-top)/scale/h)
   result.append(r)
 return result

def persistent_word_regions(samples):
 """Spatial persistence only, never logo identity/importance. Three distinct
 samples spanning >=0.8s, bounded gaps, no words or identity stored."""
 tracks=[]
 def overlap(a,b):
  left=max(a['x'],b['x']);top=max(a['y'],b['y']);right=min(a['x']+a['width'],b['x']+b['width']);bottom=min(a['y']+a['height'],b['y']+b['height'])
  inter=max(0,right-left)*max(0,bottom-top);return inter/(a['width']*a['height']+b['width']*b['height']-inter)
 for sample in sorted(samples,key=lambda s:s['time']):
  time=sample['time'];used=set()
  for r in sample['regions']:
   if r.get('kind')!='ocr-word-candidate':continue
   choices=[(overlap(r,t[-1][1]),i)for i,t in enumerate(tracks)if i not in used and 0<time-t[-1][0]<=1.2]
   score,index=max(choices,default=(0,-1))
   if score>=.5:tracks[index].append((time,r));used.add(index)
   else:tracks.append([(time,r)]);used.add(len(tracks)-1)
 result=[]
 for track in tracks:
  if len(track)<3 or track[-1][0]-track[0][0]<.8:continue
  rects=[r for _,r in track];x=min(r['x']for r in rects);y=min(r['y']for r in rects)
  result.append(dict(x=x,y=y,width=max(r['x']+r['width']for r in rects)-x,height=max(r['y']+r['height']for r in rects)-y,confidence=min(r['confidence']for r in rects),start=max(0,track[0][0]-.3),end=track[-1][0]+.8,kind='ocr-persistent-word'))
 return result
