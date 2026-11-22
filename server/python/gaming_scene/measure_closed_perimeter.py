"""Private camera-boundary producer prototype. No product activation.
Discover colored closed rectangles independently of any known region or hue;
retain ambiguity, then verify each candidate against every sequentially decoded
frame in the source interval. This is geometry evidence, not camera-role proof.
"""
import subprocess,json,hashlib,time,sys,math
import numpy as np
from native_geometry_ops import lines,candidate_roi,digest_file,presentation_times
from fractions import Fraction

def masks(frame):
    f=frame.astype(np.int16);hi=frame.max(2).astype(float);lo=frame.min(2).astype(float)
    saturated=(hi-lo)/(hi+1)>=160/255
    mask=saturated&(hi>50)
    gx=np.max(np.abs(f[:,1:]-f[:,:-1]),2)>35;gy=np.max(np.abs(f[1:]-f[:-1]),2)>35
    return mask,gx,gy

def support(frame,rect,prepared=None,band_override=None):
    mask,gx,gy=prepared if prepared is not None else masks(frame);h,w=mask.shape
    x,y,xx,yy=rect;band=band_override if band_override is not None else max(1,round(min(w,h)*.006))
    if x<0 or y<0 or xx>=w or yy>=h:return 0.,0.
    slices=[mask[max(0,y-band):y+band+1,x:xx].max(0),mask[yy-band:yy+band+1,x:xx].max(0),mask[y:yy,max(0,x-band):x+band+1].max(1),mask[y:yy,xx-band:xx+band+1].max(1)]
    edges=[gy[max(0,y-band):min(h-1,y+band+1),x:xx].max(0),gy[yy-band:min(h-1,yy+band+1),x:xx].max(0),gx[y:yy,max(0,x-band):min(w-1,x+band+1)].max(1),gx[y:yy,xx-band:min(w-1,xx+band+1)].max(1)]
    return min(float(z.mean()) for z in slices),min(float(z.mean()) for z in edges)

def discover(frame,faces):
    prepared=masks(frame);mask=prepared[0];h,w=mask.shape;hs,vs=lines(mask,True),lines(mask,False);out=[]
    if math.comb(len(hs),2)*math.comb(len(vs),2)>250000:raise RuntimeError('Discovery complexity budget exceeded; abstaining')
    for ai,x in enumerate(vs):
      for xx in vs[ai+1:]:
       if not .06<=(xx-x)/w<=.5:continue
       for bi,y in enumerate(hs):
        for yy in hs[bi+1:]:
         rw,rh=xx-x,yy-y
         if not(.06<=rh/h<=.5 and .008<=rw*rh/(w*h)<=.2 and .6<=rw/rh<=2.4):continue
         if not any(f['x']>=x/w and f['y']>=y/h and f['x']+f['width']<=xx/w and f['y']+f['height']<=yy/h for f in faces):continue
         a,b=support(frame,(x,y,xx,yy),prepared)
         if a>=.85 and b>=.7:
          out.append((x,y,xx,yy))
          if len(out)>512:raise RuntimeError('Candidate budget exceeded; abstaining')
    return out

def main(video,trackpath,outpath,maxseconds=60):
    begun=time.monotonic();track=json.load(open(trackpath));meta=track.get('metadata',{});samples=track.get('raw_samples',track.get('samples',[]));sha=digest_file(video)
    expected=meta.get('analyzed_source_sha256');assert expected==sha,'Missing or incorrect source binding'
    start=float(meta['analyzed_source_start']);end=float(meta['analyzed_source_end']);duration=end-start;assert 0<duration<=30
    info_raw=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate:format=duration','-of','json',video]));info=info_raw['streams'][0]
    assert end<=float(info_raw['format']['duration'])+.05,'Analyzed interval extends beyond actual retained source'
    sw,sh=info['width'],info['height'];w,h=sw,sh
    assert sw==track['source_width'] and sh==track['source_height'],'Source dimensions do not match retained track'
    assert sw*sh<=1920*1080, 'Native-resolution measurement above 1080p not yet qualified'
    selected_pts=presentation_times(video,start,end)
    assert selected_pts and all(b>a for a,b in zip(selected_pts,selected_pts[1:])), 'Missing or unordered presentation timestamps'
    cmd=['ffmpeg','-v','error','-threads','1','-ss',str(start),'-i',video,'-t',str(duration),'-vf',f'scale={w}:{h}','-threads','1','-f','rawvideo','-pix_fmt','rgb24','-vsync','0','pipe:1']
    proc=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE);size=w*h*3;count=0;stats=[];seeds=[];roi=None;fps=float(Fraction(info['r_frame_rate']));frame_failures=[]
    try:
      while True:
        if time.monotonic()-begun>maxseconds:raise TimeoutError('Bounded decode budget exceeded')
        data=proc.stdout.read(size)
        if not data:break
        assert len(data)==size,'Partial frame'
        frame=np.frombuffer(data,dtype=np.uint8).reshape(h,w,3)
        if count==0:
          grouped={}
          for row in samples:
            for face in row.get('faces',[]):
              if face.get('confidence',0)>=.8 and face.get('track_id'):
                grouped.setdefault(face['track_id'],[]).append(face)
          faces=[{k:float(np.median([f[k] for f in group])) for k in ['x','y','width','height']} for group in grouped.values() if len(group)>=6]
          seeds=discover(frame,faces);roi=candidate_roi(seeds,w,h,max(1,round(min(w,h)*.006))) if seeds else None;stats=[{'rect':list(r),'supported':0,'minimumSide':1.,'minimumEdge':1.} for r in seeds]
        if roi:
          rx,ry,rxx,ryy=roi;region=frame[ry:ryy,rx:rxx];prepared=masks(region)
        for r,s in zip(seeds,stats):
          local=(r[0]-rx,r[1]-ry,r[2]-rx,r[3]-ry)
          a,b=support(region,local,prepared,band_override=max(1,round(min(w,h)*.006)));s['minimumSide']=min(s['minimumSide'],a);s['minimumEdge']=min(s['minimumEdge'],b)
          if a>=.85 and b>=.7:s['supported']+=1
        count+=1
      stderr=proc.stderr.read().decode();rc=proc.wait();assert rc==0,stderr
    finally:
      if proc.poll() is None:proc.kill();proc.wait()
    clock_complete=selected_pts[0]-start<=1.1/fps and end-selected_pts[-1]<=2.1/fps and all(b-a<=2.1/fps for a,b in zip(selected_pts,selected_pts[1:])) and count==len(selected_pts)
    complete=[s for s in stats if s['supported']==count and count>=8] if clock_complete else []
    assert digest_file(video)==sha,'Source changed during measurement'
    def encloses(a,z):
      a,z=a['rect'],z['rect'];return a!=z and a[0]<=z[0] and a[1]<=z[1] and a[2]>=z[2] and a[3]>=z[3]
    maximal=[s for s in complete if not any(encloses(q,s) for q in complete)]
    # Strict containment removes redundant inner measurements, never unions boxes.
    result={'status':'unique-full-interval-rectangle' if len(maximal)==1 else 'ambiguous' if maximal else 'unresolved','maximalCandidates':maximal,'selected':maximal[0] if len(maximal)==1 else None,'nativeSupportRoi':list(roi) if roi else None,'maximumPresentationGap':max(b-a for a,b in zip(selected_pts,selected_pts[1:])) if len(selected_pts)>1 else None,'sourceSha256':sha,'sourceStart':start,'sourceEnd':end,'sourceWidth':sw,'sourceHeight':sh,'measurementWidth':w,'measurementHeight':h,'decodedFrames':count,'selectedPresentationFrames':len(selected_pts),'firstPresentationTime':selected_pts[0],'lastPresentationTime':selected_pts[-1],'clockCoverageVerified':clock_complete,'nominalFps':fps,'candidateCount':len(seeds),'completeCandidateCount':len(complete),'candidates':stats,'elapsedSeconds':time.monotonic()-begun,'limitations':['Private geometry-only producer prototype, not normal Auto or a camera-role classifier.','Color-border discovery cannot cover borderless or moving cameras. No box is emitted when missing/ambiguous.','Every decoded frame is checked for candidate perimeter support; role, HUD, action and missed cuts remain independent requirements.']}
    json.dump(result,open(outpath,'w'),indent=2);print(json.dumps({k:v for k,v in result.items() if k!='candidates'}))
if __name__=='__main__':main(*sys.argv[1:])
