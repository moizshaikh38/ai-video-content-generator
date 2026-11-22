"""Explicit local Gaming review measurement. Not a normal Auto default.
Scans the entire hue circle, not one source's color or location. A contour hole
must independently enclose a near-rectangle. Does not union crossing rectangles.
"""
import cv2,numpy as np,hashlib,json,sys

def apertures(frame):
 h,w=frame.shape[:2];hsv=cv2.cvtColor(frame,cv2.COLOR_BGR2HSV);out=[]
 pixels=frame.astype(np.int16);gx=np.max(np.abs(pixels[:,1:]-pixels[:,:-1]),axis=2)>35;gy=np.max(np.abs(pixels[1:]-pixels[:-1]),axis=2)>35;band=max(2,round(min(w,h)*.006))
 for width in [30,45,60]:
  for center in range(0,180,10):
   delta=np.abs(hsv[:,:,0].astype(int)-center);delta=np.minimum(delta,180-delta);mask=((delta<=width/2)&(hsv[:,:,1]>160)&(hsv[:,:,2]>50)).astype(np.uint8)*255
   contours,hierarchy=cv2.findContours(mask,cv2.RETR_TREE,cv2.CHAIN_APPROX_SIMPLE)
   if hierarchy is None:continue
   for i,c in enumerate(contours):
    x,y,rw,rh=cv2.boundingRect(c);area=cv2.contourArea(c)
    if hierarchy[0][i][3]<0 or not(.008<=area/(w*h)<=.2 and .06<=rw/w<=.5 and .06<=rh/h<=.5 and .6<=rw/rh<=2.4 and area/(rw*rh)>=.9):continue
    xx=x+rw-1;yy=y+rh-1
    strips=[mask[max(0,y-band):min(h,y+band+1),x:xx+1].max(0),mask[max(0,yy-band):min(h,yy+band+1),x:xx+1].max(0),mask[y:yy+1,max(0,x-band):min(w,x+band+1)].max(1),mask[y:yy+1,max(0,xx-band):min(w,xx+band+1)].max(1)]
    score=float(min((a>0).mean()for a in strips))
    edges=[gy[max(0,y-band):min(h-1,y+band+1),x:xx+1].max(0),gy[max(0,yy-band):min(h-1,yy+band+1),x:xx+1].max(0),gx[y:yy+1,max(0,x-band):min(w-1,x+band+1)].max(1),gx[y:yy+1,max(0,xx-band):min(w-1,xx+band+1)].max(1)]
    edge=float(min(a.mean()for a in edges))
    if score<.85 or edge<.7:continue
    box={'x':x/w,'y':y/h,'w':rw/w,'h':rh/h}
    if not any(max(abs(a['box'][k]-box[k])for k in box)<.002 for a in out):out.append({'box':box,'rectangularity':area/(rw*rh),'side_coverage':score,'edge_coverage':edge,'color_window':{'center':center,'width':width}})
 return out

def run(video,track):
 cap=cv2.VideoCapture(video);fps=cap.get(cv2.CAP_PROP_FPS);duration=cap.get(cv2.CAP_PROP_FRAME_COUNT)/fps;rows=[]
 if not(np.isfinite(duration)and 6<=duration<=30):cap.release();raise ValueError('Only bounded6to30second local review')
 width=cap.get(cv2.CAP_PROP_FRAME_WIDTH);height=cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
 if width*height*min(32,max(8,int(duration)+1))>12000000:cap.release();raise ValueError('Local review pixel budget exceeded')
 if any(not np.isfinite(z.get('time',float('nan')))or z['time']<0 or z['time']>=duration for z in track['raw_samples']):cap.release();raise ValueError('Face sample clock outside source review')
 for t in np.linspace(0,max(0,duration-.1),min(32,max(8,int(duration)+1))):
  cap.set(cv2.CAP_PROP_POS_MSEC,float(t)*1000);ok,frame=cap.read()
  if ok:rows.append({'time':float(t),'apertures':apertures(frame)})
 cap.release();proposals=[]
 for row in rows:
  for r in row['apertures']:
   seed=r['box'];observed=[]
   for z in rows:
    matches=[q for q in z['apertures']if max(abs(q['box'][k]-seed[k])for k in seed)<.004]
    if matches:observed.append(min(matches,key=lambda q:max(abs(q['box'][k]-seed[k])for k in seed)))
   if len(observed)<max(6,len(rows)*.85):continue
   box={k:float(np.median([q['box'][k]for q in observed]))for k in seed}
   if not any(all(abs(q['box'][k]-box[k])<1e-9 for k in box)for q in observed):continue
   anchors=[];competing=0
   for s in track['raw_samples']:
    fs=[f for f in s['faces']if f['confidence']>=.8 and f['x']>=box['x'] and f['y']>=box['y'] and f['x']+f['width']<=box['x']+box['w'] and f['y']+f['height']<=box['y']+box['h']]
    if len(fs)>1:competing+=1
    elif len(fs)==1:anchors.append({'time':s['time'],'track_id':fs[0].get('track_id')})
   if competing or len(anchors)<max(6,len(track['raw_samples'])*.25):continue
   if not any(max(abs(p['box'][k]-box[k])for k in box)<.002 for p in proposals):proposals.append({**r,'box':box,'anchor_samples':len(anchors),'anchor_observations':anchors,'observed_frames':len(observed),'sampled_frames':len(rows)})
 def contains(a,b):
  x=a['box'];y=b['box'];return a['observed_frames']>=b['observed_frames'] and {(z['time'],z['track_id'])for z in a['anchor_observations']}=={(z['time'],z['track_id'])for z in b['anchor_observations']} and x['x']<=y['x'] and x['y']<=y['y'] and x['x']+x['w']>=y['x']+y['w'] and x['y']+x['h']>=y['y']+y['h'] and x!=y
 proposals=[p for p in proposals if not any(q is not p and contains(q,p)for q in proposals)]
 with open(video,'rb')as source:
  digest=hashlib.sha256()
  for chunk in iter(lambda:source.read(1024*1024),b''):digest.update(chunk)
 return {'schema_version':3,'local_review_only':True,'not_genre_proof':True,'not_real_person_proof':True,'source_start':0,'source_end':duration,'duration_seconds':duration,'sample_clock':'interval-relative','method':'closed-color-aperture-v1','source_sha256':digest.hexdigest(),'status':'measured-rectangle'if len(proposals)==1 else'unresolved','proposals':proposals,'observations':rows,'limits':['Not normal Gaming acceptance or real-person/video-aperture proof','Independent contour-hole rectangle, never a union or arbitrary crossing-box winner','All hue locations scanned; same side, edge, time and face thresholds retained','Optional local visual/geometry candidate only; no normal default, highlight, action/HUD safety or heldout-creator proof']}
if __name__=='__main__':
 r=run(sys.argv[1],json.load(open(sys.argv[2])));json.dump(r,open(sys.argv[3],'w'),indent=2);print(json.dumps({k:v for k,v in r.items()if k!='observations'}))
