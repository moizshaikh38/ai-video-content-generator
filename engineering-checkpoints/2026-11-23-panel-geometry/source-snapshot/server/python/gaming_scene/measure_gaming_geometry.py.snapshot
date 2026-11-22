"""Native geometry stage only. No model call, role inference or track write.
A source service can call this one worker, then obtain independent region roles.
All uncertain results are explicit abstentions, not default layout activation.
"""
import hashlib,json,subprocess,sys,time
from fractions import Fraction
from pathlib import Path
import numpy as np
from measure_closed_perimeter import main as perimeter
from native_geometry_ops import digest_file,presentation_times


def measure(source,trackfile,outdir):
 begun=time.monotonic();out=Path(outdir);out.mkdir(exist_ok=False)
 track=json.loads(Path(trackfile).read_text());m=track['metadata'];sha=digest_file(source);assert sha==m['analyzed_source_sha256']
 perimeter(source,trackfile,str(out/'perimeter.json'),maxseconds=60)
 g=json.loads((out/'perimeter.json').read_text());start,end=g['sourceStart'],g['sourceEnd'];w,h=g['sourceWidth'],g['sourceHeight'];fps=g['nominalFps']
 pts=[t-start for t in presentation_times(source,start,end)]
 assert pts and all(b>a for a,b in zip(pts,pts[1:]))
 regions=[];seam=None
 if g['clockCoverageVerified'] and g['selected']:
  c=g['selected'];regions=[dict(id='A',rect=c['rect'],method='native-closed-perimeter-v1',guardPixels=2*max(2,round(min(w,h)*.006)),supportedFrames=c['supported'],minimumSide=c['minimumSide'],minimumEdge=c['minimumEdge'])]
 elif g['candidateCount']==0 and g['clockCoverageVerified']:
  script=Path(__file__).with_name('measure_side_seams.py')
  subprocess.run([sys.executable,str(script),source,trackfile,str(out/'seams.json')],check=True,timeout=80)
  seam=json.loads((out/'seams.json').read_text());best,runner=seam.get('best'),seam.get('distinctRunner')
  if best and runner and best['score']>=6 and runner['score']>=6:
   boxes=[best['rect'],runner['rect']];assert all(r[0]==0 and 0<r[2]<w and 0<=r[1]<r[3]<h for r in boxes)
   band=max(2,round(min(w,h)*.003));stats=[[],[]];flip=seam['sourceFlipX'];assert isinstance(flip,bool)
   def gx(f,col,a,b):
    z=f[a:b,max(0,col-band):min(w,col+band+2)].astype(np.int16);return float(np.abs(np.diff(z,axis=1)).max(axis=(1,2)).mean())
   def gy(f,row,a,b):
    z=f[max(0,row-band):min(h,row+band+2),a:b].astype(np.int16);return float(np.abs(np.diff(z,axis=0)).max(axis=(0,2)).mean())
   p=subprocess.Popen(['ffmpeg','-v','error','-threads','1','-ss',str(start),'-i',source,'-t',str(end-start),'-threads','1','-f','rawvideo','-pix_fmt','rgb24','-vsync','0','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   try:
    while True:
     assert time.monotonic()-begun<145,'Bounded geometry stage budget'
     data=p.stdout.read(w*h*3)
     if not data:break
     assert len(data)==w*h*3
     f=np.frombuffer(data,np.uint8).reshape(h,w,3);f=f[:,::-1] if flip else f
     for box,values in zip(boxes,stats):
      _,y,xx,yy=box;rh=yy-y;ext=min(xx,w-xx)
      contrast=[gy(f,y,0,xx)-gy(f,y,xx,xx+ext),gy(f,yy,0,xx)-gy(f,yy,xx,xx+ext),gx(f,xx,y,yy)-(gx(f,xx,max(0,y-rh),y)+gx(f,xx,yy,min(h,yy+rh)))/2]
      values.append(min(contrast))
    err=p.stderr.read();assert p.wait()==0,err.decode()
   finally:
    if p.poll() is None:p.kill();p.wait()
   if all(len(v)==len(pts) and all(x>=6 for x in v) for v in stats):
    for i,(box,values) in enumerate(zip(boxes,stats)):
     x,y,xx,yy=box;actual=[w-xx,y,w-x,yy] if flip else box
     regions.append(dict(id=chr(65+i),rect=actual,method='native-side-seams-v1',guardPixels=2*band,supportedFrames=len(values),minimumPerFrameSeamContrast=min(values)))
 complete=len(pts)==g['decodedFrames'] and pts[0]<=1.1/fps and end-start-pts[-1]<=2.1/fps and all(0<b-a<=2.1/fps for a,b in zip(pts,pts[1:]))
 assert digest_file(source)==sha,'Source changed during measurement'
 result=dict(version=1,status='geometry-candidates-awaiting-independent-roles' if complete and regions else 'unresolved',sourceSha256=sha,sourceStart=start,sourceEnd=end,sourceWidth=w,sourceHeight=h,decodedFrames=g['decodedFrames'],presentationFrames=len(pts),presentationTimes=pts,nominalFps=fps,clockCoverageVerified=complete,regions=regions if complete else [],scalarSeamSelection=(dict(margin=seam['margin'],accepted=seam['selected'] is not None) if seam else None),elapsedSeconds=time.monotonic()-begun,scope='Source-bound geometry only. Region roles, hidden game pixels, HUD/action safety, ordinary app integration and review approval remain independent. No model call or track write.')
 (out/'geometry-candidates.json').write_text(json.dumps(result,indent=2));return result

if __name__=='__main__':
 r=measure(*sys.argv[1:]);print(json.dumps({k:v for k,v in r.items() if k!='presentationTimes'},indent=2))
