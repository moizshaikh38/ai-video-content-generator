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

def run(video,track,start_sec=0.0,duration_sec=None):
 samples=track['raw_samples'];cap=cv2.VideoCapture(video);rows=[]
 # Face times remain interval-relative. Decode at the corresponding source
 # clock, never combine a short clip's faces with whole-source border frames.
 source_fps=cap.get(cv2.CAP_PROP_FPS);source_frames=cap.get(cv2.CAP_PROP_FRAME_COUNT)
 if not(np.isfinite(source_fps) and source_fps>0 and np.isfinite(source_frames) and source_frames>0):
  cap.release();raise ValueError('Source clock unavailable')
 source_duration=source_frames/source_fps
 start=float(start_sec);duration=source_duration-start if duration_sec is None else float(duration_sec)
 if not(np.isfinite(start) and np.isfinite(duration) and start>=0 and duration>0 and start+duration<=source_duration+.001):
  cap.release();raise ValueError('Invalid source interval')
 meta=track.get('metadata')or{}
 for field,expected in [('analyzed_source_start',start),('analyzed_source_end',start+duration),('clip_duration',duration)]:
  recorded=meta.get(field)
  if recorded is not None and (not isinstance(recorded,(int,float)) or not np.isfinite(recorded) or abs(recorded-expected)>.001):
   cap.release();raise ValueError('Face evidence interval mismatch: '+field)
 if any(not np.isfinite(s.get('time',float('nan'))) or s['time']<0 or s['time']>=duration for s in samples):
  cap.release();raise ValueError('Face samples must use the selected interval clock')
 # One frame per second, at most32 observations, independent of speech/face loss.
 times=np.linspace(0,max(0,duration-.1),min(32,max(8,int(duration)+1)))
 for t in times:
  cap.set(cv2.CAP_PROP_POS_MSEC,(start+float(t))*1000);ok,f=cap.read()
  if not ok:continue
  rows.append({'time':float(t),'source_time':start+float(t),'regions':candidates(f)})
 cap.release()
 proposals=[]
 for row in rows:
  for r in row['regions']:
   observations=[]
   for z in rows:
    matches=[q for q in z['regions']if max(abs(q[k]-r[k])for k in ['x','y','w','h'])<=.015]
    if matches:observations.append(min(matches,key=lambda q:(max(abs(q[k]-r[k])for k in ['x','y','w','h']),-q['side_coverage'],-q['w']*q['h'])))
   if len(observations)<max(6,len(rows)*.85):continue
   box={k:float(np.median([q[k]for q in observations]))for k in ['x','y','w','h']}
   anchors={};competing=0
   for s in samples:
    fs=[f for f in s['faces']if f['confidence']>=.8 and f['x']>=box['x']and f['y']>=box['y']and f['x']+f['width']<=box['x']+box['w']and f['y']+f['height']<=box['y']+box['h']]
    if len(fs)>1:competing+=1
    elif len(fs)==1 and fs[0].get('track_id'):anchors[fs[0]['track_id']]=anchors.get(fs[0]['track_id'],0)+1
   if competing or sum(anchors.values())<max(6,len(samples)*.25):continue
   if not any(max(abs(p['box'][k]-box[k])for k in box)<.002 for p in proposals):
    proposals.append({'box':box,'anchor_track_ids':sorted(anchors),'anchor_samples':sum(anchors.values()),'observed_frames':len(observations),'sampled_frames':len(rows),'minimum_side_coverage':min(q['side_coverage']for q in observations),'minimum_edge_coverage':min(q.get('edge_coverage',0)for q in observations)})
 # An independently measured outer border subsumes a nested decorative inner
 # border with the same face anchors and coverage. Never manufacture a union
 # of crossing candidates or lower the evidence threshold to select a crop.
 def contains(outer,inner):
  a=outer['box'];b=inner['box'];return a['x']<=b['x']+.002 and a['y']<=b['y']+.002 and a['x']+a['w']>=b['x']+b['w']-.002 and a['y']+a['h']>=b['y']+b['h']-.002 and a['w']*a['h']>b['w']*b['h']*1.01
 proposals=[p for p in proposals if not any(q is not p and q['anchor_track_ids']==p['anchor_track_ids'] and q['observed_frames']>=p['observed_frames'] and contains(q,p) for q in proposals)]
 with open(video,'rb') as source_file:
  digest=hashlib.sha256()
  for chunk in iter(lambda:source_file.read(1024*1024),b''):digest.update(chunk)
  source_sha=digest.hexdigest()
 return {'schema_version':1,'status':'measured-rectangle'if len(proposals)==1 else 'unresolved','not_genre_proof':True,'not_real_person_proof':True,'source_start':start,'source_end':start+duration,'duration_seconds':duration,'sample_clock':'interval-relative','source_sha256':source_sha,'proposals':proposals,'observations':rows}
if __name__=='__main__':
 result=run(sys.argv[1],json.load(open(sys.argv[2])),float(sys.argv[4]) if len(sys.argv)>4 else 0.0,float(sys.argv[5]) if len(sys.argv)>5 else None);json.dump(result,open(sys.argv[3],'w'),indent=2);print(json.dumps({k:v for k,v in result.items()if k!='observations'}))
