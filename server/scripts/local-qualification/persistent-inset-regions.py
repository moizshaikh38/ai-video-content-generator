"""Measured persistent colored rectangular insets. Geometry only, not genre or speech.
Offline qualification first. No model downloads, no fixed game, region or border hue.
"""
import cv2, numpy as np, json, sys, hashlib

def candidates(frame):
 h,w=frame.shape[:2]
 hsv=cv2.cvtColor(frame,cv2.COLOR_BGR2HSV)
 mask=((hsv[:,:,1]>160)&(hsv[:,:,2]>50)).astype(np.uint8)*255
 hs=[];vs=[]
 for orientation,kernel in [('h',(max(16,round(w*.04)),1)),('v',(1,max(16,round(h*.04))))]:
  opened=cv2.morphologyEx(mask,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,kernel))
  contours,_=cv2.findContours(opened,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
  for c in contours:
   x,y,rw,rh=cv2.boundingRect(c)
   if orientation=='h' and rw>=w*.06 and rh<=h*.035:hs.extend([y,y+rh-1])
   if orientation=='v' and rh>=h*.06 and rw<=w*.035:vs.extend([x,x+rw-1])
 hs=sorted(set(hs));vs=sorted(set(vs))
 out=[];band=max(2,round(min(w,h)*.006))
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
     r={'x':x/w,'y':y/h,'w':rw/w,'h':rh/h,'side_coverage':score}
     out.append(r)
 return out

def run(video,track):
 samples=track['raw_samples'];cap=cv2.VideoCapture(video);rows=[]
 # One frame per second, at most32 observations, independent of speech/face loss.
 dur=cap.get(cv2.CAP_PROP_FRAME_COUNT)/cap.get(cv2.CAP_PROP_FPS)
 times=np.linspace(0,max(0,dur-.1),min(32,max(8,int(dur)+1)))
 for t in times:
  cap.set(cv2.CAP_PROP_POS_MSEC,float(t)*1000);ok,f=cap.read()
  if not ok:continue
  rows.append({'time':float(t),'regions':candidates(f)})
 cap.release()
 proposals=[]
 for row in rows:
  for r in row['regions']:
   observations=[]
   for z in rows:
    matches=[q for q in z['regions']if max(abs(q[k]-r[k])for k in ['x','y','w','h'])<=.015]
    if matches:observations.append(max(matches,key=lambda q:(q['side_coverage'],q['w']*q['h'])))
   if len(observations)<max(6,len(rows)*.85):continue
   box={k:float(np.median([q[k]for q in observations]))for k in ['x','y','w','h']}
   anchors={};competing=0
   for s in samples:
    fs=[f for f in s['faces']if f['confidence']>=.8 and f['x']>=box['x']and f['y']>=box['y']and f['x']+f['width']<=box['x']+box['w']and f['y']+f['height']<=box['y']+box['h']]
    if len(fs)>1:competing+=1
    elif len(fs)==1 and fs[0].get('track_id'):anchors[fs[0]['track_id']]=anchors.get(fs[0]['track_id'],0)+1
   if competing or sum(anchors.values())<max(6,len(samples)*.25):continue
   if not any(max(abs(p['box'][k]-box[k])for k in box)<.02 for p in proposals):
    proposals.append({'box':box,'anchor_track_ids':sorted(anchors),'anchor_samples':sum(anchors.values()),'observed_frames':len(observations),'sampled_frames':len(rows),'minimum_side_coverage':min(q['side_coverage']for q in observations)})
 return {'schema_version':1,'status':'measured-rectangle'if len(proposals)==1 else 'unresolved','not_genre_proof':True,'source_sha256':hashlib.sha256(open(video,'rb').read()).hexdigest(),'proposals':proposals,'observations':rows}
if __name__=='__main__':
 result=run(sys.argv[1],json.load(open(sys.argv[2])));json.dump(result,open(sys.argv[3],'w'),indent=2);print(json.dumps({k:v for k,v in result.items()if k!='observations'}))
