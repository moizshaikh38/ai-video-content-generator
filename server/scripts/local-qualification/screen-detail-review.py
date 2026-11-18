"""Offline screen-role review proposal, never Auto role/meaning detection.
Independent measured image change + measured text candidates. Full overview
must remain visible alongside any proposed detail. No code imported from sites.
"""
from pathlib import Path
import cv2,numpy as np,json,sys,hashlib,math,subprocess
source=Path(sys.argv[2]);track=json.load(open(sys.argv[3]));regions=track['metadata']['protected_content_regions'];assert track['metadata']['analyzed_source_sha256']==hashlib.sha256(source.read_bytes()).hexdigest()
cap=cv2.VideoCapture(str(source));out=Path(sys.argv[1]);out.mkdir(exist_ok=False);rows=[];baseline=None;previous=None;still=[]
for n in range(math.ceil(min(12,cap.get(cv2.CAP_PROP_FRAME_COUNT)/cap.get(cv2.CAP_PROP_FPS))*4)):
 t=n/4;cap.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,frame=cap.read()
 if not ok:break
 small=cv2.resize(frame,(480,270));gray=cv2.cvtColor(small,cv2.COLOR_BGR2GRAY);blur=cv2.GaussianBlur(gray,(5,5),0)
 if baseline is None:baseline=blur.copy()
 diff=cv2.absdiff(blur,baseline);mask=(diff>24).astype('uint8')*255;fraction=float(np.mean(mask>0));proposal=None;reason='no-bounded-persistent-change'
 if fraction>.35:baseline=blur.copy();previous=None;reason='global-change-reset'
 elif fraction>=.003:
  dilated=cv2.dilate(mask,np.ones((7,7),np.uint8));count,labels,stats,_=cv2.connectedComponentsWithStats(dilated)
  if count>1:
   r=stats[1+np.argmax(stats[1:,cv2.CC_STAT_AREA])];x,y,w,h,area=[int(v)for v in r];box={'x':x/480,'y':y/270,'width':w/480,'height':h/270};mass=np.count_nonzero(mask[y:y+h,x:x+w])/max(1,np.count_nonzero(mask));rect_area=w*h/(480*270)
   if .015<=rect_area<=.35 and mass>=.6:
    selected=[r for r in regions if r['start']<=t<r['end']and r['x']<box['x']+box['width'] and r['x']+r['width']>box['x']and r['y']<box['y']+box['height'] and r['y']+r['height']>box['y']]
    if len(selected)>=3 and previous and abs(previous['x']-box['x'])<.08 and abs(previous['y']-box['y'])<.08:
     left=max(0,min([box['x']]+[r['x']for r in selected])-.025);top=max(0,min([box['y']]+[r['y']for r in selected])-.025);right=min(1,max([box['x']+box['width']]+[r['x']+r['width']for r in selected])+.025);bottom=min(1,max([box['y']+box['height']]+[r['y']+r['height']for r in selected])+.025)
     if (right-left)*(bottom-top)<=.5:proposal={'x':left,'y':top,'width':right-left,'height':bottom-top,'overlapping_text_boxes':len(selected)};reason='screen-role-review-only'
    previous=box
   else:previous=None
 else:previous=None
 rows.append({'time':t,'changed_pixel_fraction':round(fraction,5),'proposal':proposal,'reason':reason})
 if n in [0,8,12,16,20,24,28,30]:
  if proposal:
   r=proposal;h,w=frame.shape[:2];cv2.rectangle(frame,(int(r['x']*w),int(r['y']*h)),(int((r['x']+r['width'])*w),int((r['y']+r['height'])*h)),(0,0,255),2)
  cv2.putText(frame,str(t)+'s '+reason,(10,30),cv2.FONT_HERSHEY_SIMPLEX,.6,(0,0,255),2);still.append(cv2.resize(frame,(480,270)))
cap.release()
def iou(a,b):
 x=max(a['x'],b['x']);y=max(a['y'],b['y']);right=min(a['x']+a['width'],b['x']+b['width']);bottom=min(a['y']+a['height'],b['y']+b['height']);inter=max(0,right-x)*max(0,bottom-y)
 return inter/(a['width']*a['height']+b['width']*b['height']-inter)
episodes=[];current=[]
for row in rows:
 if not row['proposal']:continue
 if current:
  last=current[-1];between=[r for r in rows if last['time']<r['time']<row['time']]
  if row['time']-last['time']>.75 or iou(last['proposal'],row['proposal'])<.8 or any(r['changed_pixel_fraction']<.003 or r['reason']=='global-change-reset' for r in between):
   episodes.append(current);current=[]
 current.append(row)
if current:episodes.append(current)
plans=[]
for episode in episodes:
 if episode[-1]['time']-episode[0]['time']<.75:continue
 boxes=[r['proposal']for r in episode];x=min(r['x']for r in boxes);y=min(r['y']for r in boxes);right=max(r['x']+r['width']for r in boxes);bottom=max(r['y']+r['height']for r in boxes)
 plans.append({'start':episode[0]['time'],'end':episode[-1]['time']+.25,'x':x,'y':y,'width':right-x,'height':bottom-y,'max_bridged_gap_seconds':.5})
report={'scope':'Offline explicit-screen-role review only, not role detection/semantic target or product Auto. Full source overview retained. Offline lookahead stabilization, not live cursor tracking.','rows':rows,'review_episodes':plans}
(out/'proposal.json').write_text(json.dumps(report,indent=2))
cv2.imwrite(str(out/'proposal-board.png'),np.vstack([np.hstack(still[i:i+2])for i in range(0,len(still),2)]))
if '--render'in sys.argv:
 c=cv2.VideoCapture(str(source));fps=c.get(cv2.CAP_PROP_FPS);duration=min(12,c.get(cv2.CAP_PROP_FRAME_COUNT)/fps);writer=cv2.VideoWriter(str(out/'review-scratch.mp4'),cv2.VideoWriter_fourcc(*'mp4v'),fps,(720,1280));count=0
 while count/fps<duration:
  ok,f=c.read()
  if not ok:break
  t=count/fps;box=next((p for p in plans if p['start']<=t<p['end']),None);canvas=np.zeros((1280,720,3),np.uint8);h,w=f.shape[:2];canvas[80:485]=cv2.resize(f,(720,405))
  if box:
   x0,y0=int(box['x']*w),int(box['y']*h);x1,y1=int((box['x']+box['width'])*w),int((box['y']+box['height'])*h);crop=f[y0:y1,x0:x1];ch,cw=crop.shape[:2];dh=round(ch*720/cw);assert dh<=600;canvas[650:650+dh]=cv2.resize(crop,(720,dh))
  writer.write(canvas);count+=1
 writer.release();c.release()
 subprocess.run(['ffmpeg','-v','error','-y','-threads','1','-i',str(out/'review-scratch.mp4'),'-an','-threads','1','-c:v','libx264','-preset','ultrafast','-crf','22',str(out/'overview-detail-review.mp4')],check=True)
 # Only this reproducible scratch encoder intermediate, never source/evidence.
 (out/'review-scratch.mp4').unlink()
print(json.dumps(plans))
