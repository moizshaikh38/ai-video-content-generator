"""Opt-in local DB text-shape review, not word recognition or importance.

OpenCV official DB_IC15_resnet18, SHA1 pinned to official documentation:
https://github.com/opencv/opencv/blob/master/doc/tutorials/dnn/dnn_text_spotting/dnn_text_spotting.markdown
Model is not bundled. Requesting a missing/wrong model fails explicitly.
"""
import hashlib, os
import cv2
MODEL_SHA1='19543ce09b2efd35f49705c235cc46d0e22df30b'

def rectangles_from_polygons(polygons,scores,width,height):
 result=[]
 for points,score in zip(polygons,scores):
  # Convex quadrangles in original frame coordinates. Keep all of a word,
  # including its tilted corners, with an eight-source-pixel safety margin.
  if len(points)!=4 or not .5<=float(score)<=1:continue
  xs=[float(p[0])for p in points];ys=[float(p[1])for p in points]
  if not all(__import__('math').isfinite(v)for v in xs+ys):continue
  left=max(0,min(xs)-8);top=max(0,min(ys)-8)
  right=min(width,max(xs)+8);bottom=min(height,max(ys)+8)
  if right<=left or bottom<=top:continue
  result.append(dict(x=left/width,y=top/height,width=(right-left)/width,height=(bottom-top)/height,confidence=float(score),kind='db-text-shape'))
 return result

class TextGeometryRegions:
 def __init__(self,path):
  if not os.path.isfile(path):raise ValueError('Text geometry model not found')
  with open(path,'rb')as f: digest=hashlib.sha1(f.read()).hexdigest()
  if digest!=MODEL_SHA1:raise ValueError('Text geometry model checksum mismatch')
  self.model=cv2.dnn_TextDetectionModel_DB(path)
  self.model.setBinaryThreshold(.3);self.model.setPolygonThreshold(.5)
  self.model.setUnclipRatio(2.0);self.model.setMaxCandidates(200)
  self.model.setInputParams(1/255.,(640,384),(122.67891434,116.66876762,104.00698793))
 def infer(self,frame):
  h,w=frame.shape[:2];polygons,scores=self.model.detect(frame)
  return rectangles_from_polygons(polygons,scores,w,h)

def coverage_record(sample_times,duration,region_count,detectors):
 times=sorted(set(sample_times));bounds=[0]+times+[max(0,duration)]
 return dict(status='sampled-incomplete' if times else 'not-sampled',detectors=detectors,sample_count=len(times),max_unsampled_gap_seconds=round(max((max(0,b-a)for a,b in zip(bounds,bounds[1:])),default=max(0,duration)),6),region_count=region_count,absence_means='unknown',limitations=['Unseen-between-samples','Text-shape misses and false positives possible','No semantic importance or legibility guarantee'])


def collect_isolated(video_path,model_path,frame_indices,source_fps,start_sec,duration):
 import subprocess,sys,json
 payload=dict(video_path=video_path,model_path=model_path,frame_indices=frame_indices,source_fps=source_fps,start_sec=start_sec,duration=duration)
 p=subprocess.run([sys.executable,__file__],input=json.dumps(payload),capture_output=True,text=True,timeout=60,check=True)
 result=json.loads(p.stdout)
 if not isinstance(result,dict) or not isinstance(result.get('samples'),list):raise ValueError('Malformed text geometry worker result')
 return result

def worker(payload):
 from sample_clock import sample_relative_time
 import resource
 cv2.setNumThreads(2)
 detector=TextGeometryRegions(payload['model_path'])
 cap=cv2.VideoCapture(payload['video_path'])
 if not cap.isOpened():raise ValueError('Text geometry worker cannot open video')
 if abs(cap.get(cv2.CAP_PROP_FPS)-payload['source_fps'])>.0001:raise ValueError('Text geometry source clock mismatch')
 samples=[]
 try:
  for index in payload['frame_indices']:
   cap.set(cv2.CAP_PROP_POS_FRAMES,index);ok,frame=cap.read()
   if not ok:raise ValueError('Text geometry worker failed to decode requested sample')
   samples.append(dict(time=sample_relative_time(index,payload['source_fps'],payload['start_sec']),regions=detector.infer(frame)))
 finally:cap.release()
 return dict(samples=samples,peak_rss_kib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,input_size=[640,384],execution='isolated-sequential-pass')

if __name__=='__main__':
 import sys,json
 print(json.dumps(worker(json.loads(sys.stdin.read()))))
