"""Offline no-weight mouth-motion/audio-energy hypothesis, never product ASD.
Predetermined extraction:25fps,96px face, upper-face median flow compensation,
lower central mouth residual, 0.2s smoothing, max correlation within +/-0.2s.
Compare exact,wrong-source,reversed,2/5s shifted,mute, and mouth-vs-upper ROI.
No threshold optimization, no activation, no identity/diarization claim.
"""
import sys,json,pathlib,subprocess,cv2,numpy as np
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(exist_ok=False,parents=True)
t=json.loads((root/'fresh-normal-track.json').read_text());source=root/'verified-source.mp4';samples=t['raw_samples'];fps=25;ids=sorted({f['track_id'] for s in samples for f in s['faces']});times=np.array([s['time'] for s in samples]);frames=[]
raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(source),'-an','-vf','fps=25','-f','rawvideo','-pix_fmt','gray','-threads','1','pipe:1']);w,h=t['source_width'],t['source_height'];video=np.frombuffer(raw,np.uint8).reshape(-1,h,w);n=len(video)
def audio(file):
 data=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(file),'-vn','-ac','1','-ar','16000','-f','f32le','pipe:1']),np.float32);length=n*640;data=np.pad(data,(0,max(0,length-len(data))))[:length];return np.sqrt(np.mean(data.reshape(n,640)**2,axis=1))
def smooth(x):return np.convolve(x,np.ones(5)/5,mode='same')
def correlation(a,b):
 a=smooth(a);b=smooth(b);scores=[]
 for lag in range(-5,6):
  x=a[5+max(lag,0):len(a)-5+min(lag,0)];y=b[5+max(-lag,0):len(b)-5+min(-lag,0)]
  scores.append(float(np.corrcoef(x,y)[0,1]) if np.std(x)>1e-8 and np.std(y)>1e-8 else 0)
 return max(scores)
features={};upper={}
for id in ids:
 coords=[]
 for k in ['x','y','width','height']:
  obs=[(s['time'],next((f[k] for f in s['faces'] if f['track_id']==id),None)) for s in samples];obs=[(x,y) for x,y in obs if y is not None];coords.append(np.interp(np.arange(n)/fps,[x for x,y in obs],[y for x,y in obs]))
 crops=[]
 for i,frame in enumerate(video):
  x,y,bw,bh=[c[i] for c in coords];x=max(0,int(x*w));y=max(0,int(y*h));bw=max(4,min(w-x,int(bw*w)));bh=max(4,min(h-y,int(bh*h)));crop=cv2.resize(frame[y:y+bh,x:x+bw],(96,96));crops.append(crop)
 motion=[0];up=[0]
 for a,b in zip(crops[:-1],crops[1:]):
  flow=cv2.calcOpticalFlowFarneback(a,b,None,.5,3,15,3,5,1.2,0);head=np.median(flow[8:48,8:88].reshape(-1,2),axis=0);res=np.linalg.norm(flow-head,axis=2);motion.append(float(np.mean(res[58:88,22:74])));up.append(float(np.mean(res[10:40,22:74])))
 features[id]=np.array(motion);upper[id]=np.array(up)
exact=audio(source);wrong=audio(pathlib.Path(sys.argv[3]));controls={'exact':exact,'wrong_source':wrong,'reversed_audio':exact[::-1],'shift_2s':np.roll(exact,50),'shift_5s':np.roll(exact,125),'mute':np.zeros(n)}
report={'offlineOnly':True,'learnedWeights':False,'noActivation':True,'source':str(source),'sampleFrames':n,'seconds':n/fps,'mouthScores':{label:{id:correlation(motion,a) for id,motion in features.items()} for label,a in controls.items()},'upperFaceExactScores':{id:correlation(motion,exact) for id,motion in upper.items()},'limits':['energy correlation is not speech identity','head and expression motion can correlate','wrong-audio comparisons must be separated','no speaker accuracy label or production integration']}
(out/'report.json').write_text(json.dumps(report,indent=2));np.savez(out/'features.npz',audio=exact,wrong=wrong,**features);print(json.dumps(report,indent=2))
