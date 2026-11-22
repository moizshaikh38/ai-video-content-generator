"""Private edge-anchored borderless-camera seam prototype. No default activation."""
import sys,json,hashlib,subprocess,time
import numpy as np
from pathlib import Path
from native_geometry_ops import digest_file
video,trackfile,out=sys.argv[1:];begun=time.monotonic();track=json.load(open(trackfile));m=track['metadata'];sha=digest_file(video);assert sha==m['analyzed_source_sha256'];start,end=m['analyzed_source_start'],m['analyzed_source_end'];duration=end-start;assert 0<duration<=30
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate:format=duration','-of','json',video]));stream=probe['streams'][0];w,h=stream['width'],stream['height'];assert w*h<=1920*1080 and end<=float(probe['format']['duration'])+.05
samples=track['raw_samples'];groups={}
for row in samples:
 for f in row['faces']:
  if f['confidence']>=.8 and f.get('track_id'):groups.setdefault(f['track_id'],[]).append(f)
anchors=[]
for key,fs in groups.items():
 if len(fs)<max(6,len(samples)*.5):continue
 centers=np.array([[f['x']+f['width']/2,f['y']+f['height']/2] for f in fs]);cx,cy=np.median(centers,axis=0)
 if .3<cx<.7 or np.ptp(centers,axis=0).max()>.06:continue
 anchors.append((key,fs,cx>.5))
assert len(anchors)==1,'Need one independently repeated side-anchored region candidate'
key,fs,flip=anchors[0]
xs=[(1-f['x']-f['width'] if flip else f['x']) for f in fs];xe=[x+f['width'] for x,f in zip(xs,fs)];ys=[f['y'] for f in fs];ye=[f['y']+f['height'] for f in fs]
face=(min(xs)*w,min(ys)*h,max(xe)*w,max(ye)*h);fw,fh=face[2]-face[0],face[3]-face[1]
def frames():
 p=subprocess.Popen(['ffmpeg','-v','error','-threads','1','-ss',str(start),'-i',video,'-t',str(duration),'-threads','1','-f','rawvideo','-pix_fmt','rgb24','-vsync','0','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 try:
  while True:
   if time.monotonic()-begun>75:raise TimeoutError('Bounded seam budget exceeded')
   b=p.stdout.read(w*h*3)
   if not b:break
   assert len(b)==w*h*3
   a=np.frombuffer(b,np.uint8).reshape(h,w,3);yield a[:,::-1] if flip else a
  error=p.stderr.read();assert p.wait()==0,error.decode()
 finally:
  if p.poll() is None:p.kill();p.wait()
V=np.zeros((h,w-1),np.float32);H=np.zeros((h-1,w),np.float32);count=0
for f in frames():
 a=f.astype(np.int16);V+=np.max(np.abs(a[:,1:]-a[:,:-1]),axis=2);H+=np.max(np.abs(a[1:]-a[:-1]),axis=2);count+=1
V/=count;H/=count;VP=np.vstack([np.zeros((1,w-1),np.float32),np.cumsum(V,axis=0)]);HP=np.column_stack([np.zeros(h-1,np.float32),np.cumsum(H,axis=1)])
ymin=max(0,int(face[1]-max(fh*3,h*.08)));ymax=min(h-2,int(face[1])-2);bmin=max(int(face[3])+2,int(h*.08));bmax=min(h-2,int(face[3]+max(fh*3,h*.12)))
candidates=[]
for x in range(max(int(face[2])+2,int(w*.08)),min(w-2,int(w*.45)),2):
 width=min(x,w-x-1);hs=HP[:,x]/x-(HP[:,x+width]-HP[:,x])/width
 tops=sorted(range(ymin,ymax),key=lambda y:hs[y],reverse=True)[:18];bottoms=sorted(range(bmin,bmax),key=lambda y:hs[y],reverse=True)[:18]
 for y in tops:
  for yy in bottoms:
   rh=yy-y
   if not(.08<=rh/h<=.5 and x*rh/(w*h)<=.2 and .6<=x/rh<=2.4):continue
   inside=(VP[yy,x]-VP[y,x])/rh;outside=((VP[y,x]-VP[max(0,y-rh),x])+(VP[min(h,yy+rh),x]-VP[yy,x]))/max(1,min(y,rh)+min(h-yy,rh));vs=inside-outside
   ss=[float(hs[y]),float(hs[yy]),float(vs)];score=min(ss)
   if score>0:candidates.append({'rect':[0,y,x,yy],'score':score,'seamContrast':ss})
candidates.sort(key=lambda q:q['score'],reverse=True);best=candidates[0] if candidates else None
runner=next((q for q in candidates if best and max(abs(a-b) for a,b in zip(q['rect'],best['rect']))>min(w,h)*.025),None)
margin=best['score']/runner['score'] if best and runner and runner['score']>0 else 0
selected=best if best and best['score']>=6 and margin>=1.12 else None
result={'status':'candidate' if selected else 'unresolved','sourceSha256':sha,'sourceStart':start,'sourceEnd':end,'sourceWidth':w,'sourceHeight':h,'decodedFrames':count,'sourceFlipX':bool(flip),'anchorTrack':key,'best':best,'distinctRunner':runner,'margin':margin,'selected':selected,'topCandidates':candidates[:25],'elapsedSeconds':time.monotonic()-begun,'scope':'Private temporal pixel-seam discovery anchored to retained face candidates. Not certified boundary, source role, HUD/action or normal Auto proof. No threshold lowered on failure.'};Path(out).write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='topCandidates'},indent=2))
