"""Opt-in bounded resolution pyramid. Same YuNet score threshold and later NMS.

Only low-resolution frames gain a up to two extra inferences, capped at1920x1080/2x.
No temporal boxes, guessed faces, altered confidence or source-specific hints.
"""
import cv2
from detector_geometry import visible_detector_rect
from face_evidence import candidate_evidence

def inference_sizes(width,height,enabled=False):
 sizes=[(width,height)]
 if enabled:
  factor=min(2.,1920/width,1080/height)
  for scale in sorted(set([min(1.5,factor),factor])):
   if scale>=1.25:sizes.append((round(width*scale),round(height*scale)))
 return sizes

def detect_candidates(detector,frame,enabled=False):
 h,w=frame.shape[:2];result=[]
 try:
  for iw,ih in inference_sizes(w,h,enabled):
   image=frame if (iw,ih)==(w,h) else cv2.resize(frame,(iw,ih))
   detector.setInputSize((iw,ih));_,faces=detector.detect(image)
   if faces is None:continue
   for f in faces:
    raw_box=[f[0]*w/iw,f[1]*h/ih,f[2]*w/iw,f[3]*h/ih]
    rect=visible_detector_rect(raw_box,w,h)
    points=[float(f[j])*(w/iw if j%2==0 else h/ih) for j in range(4,14)] if len(f)>=15 else None
    if rect and rect[2]>=16 and rect[3]>=16:result.append(dict(rect=rect,confidence=round(min(.98,max(.5,float(f[-1]))),2),is_frontal=True,face_evidence=candidate_evidence('opencv-yunet',raw_box,w,h,float(f[-1]),points)))
 finally:detector.setInputSize((w,h))
 return result
