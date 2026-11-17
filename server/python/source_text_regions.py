"""Offline review OCR constraints. Text existence, not importance or legibility.

Multi-word OCR lines become indivisible measured rectangles. No recognized
words are retained in records. Misses and false positives remain possible.
"""
import csv, io, subprocess, tempfile, os
import cv2

def regions_from_tsv(tsv,width,height):
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
  if len(strong)<2 or sum(v[5]for v in strong)<8:continue
  # Include low-confidence words in that same measured line. Discarding them
  # could trim sentence ends even when the middle is confidently recognized.
  x=max(0,min(v[0]for v in words)-8);y=max(0,min(v[1]for v in words)-8)
  right=min(width,max(v[0]+v[2]for v in words)+8);bottom=min(height,max(v[1]+v[3]for v in words)+8)
  result.append(dict(x=x/width,y=y/height,width=(right-x)/width,height=(bottom-y)/height,confidence=min(v[4]for v in strong)/100,kind='ocr-multiword-line'))
 return result

def source_text_regions(frame):
 h,w=frame.shape[:2];result=[]
 # Full scene plus a generic enlarged lower-half text pass. Neither route
 # knows the title, subtitle wording or source-specific position/appearance.
 for index,(image,offset,scale) in enumerate([(frame,0,1),(cv2.resize(frame[h//2:],None,fx=1.5,fy=1.5),h//2,1.5)]):
  ih,iw=image.shape[:2]
  with tempfile.TemporaryDirectory() as d:
   path=os.path.join(d,'frame.png');cv2.imwrite(path,image)
   p=subprocess.run(['tesseract',path,'stdout','--psm','11','tsv'],capture_output=True,text=True,timeout=5,check=True)
  for r in regions_from_tsv(p.stdout,iw,ih):
   x=r['x']*iw/scale;y=r['y']*ih/scale+offset;rw=r['width']*iw/scale;rh=r['height']*ih/scale
   r.update(x=x/w,y=y/h,width=rw/w,height=rh/h)
   result.append(r)
 return result
