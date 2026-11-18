"""Offline competitive score falsification on simultaneous people. No product hook.
Retained traceable model and preprocessing; no threshold optimization or downloads.
"""
from pathlib import Path
import sys,json,hashlib,time
sys.path.insert(0,'/home/sandbox/vireo-asd-cpu-eval/runtime')
import cv2,numpy as np,onnxruntime as ort
from scipy.io import wavfile
from python_speech_features import mfcc
root=Path('/downloads/vireo-natural-panel-scout-1900');out=Path('/downloads/vireo-natural-four-relative-asd-1906');out.mkdir(exist_ok=False)
source=root/'nasa-four-natural-14s.mp4';track=json.load(open('/downloads/vireo-natural-four-ui-1902/fresh-normal-track.json'));assert track['metadata']['analyzed_source_sha256']==hashlib.sha256(source.read_bytes()).hexdigest()
sr,audio=wavfile.read(root/'natural4-14s.wav');wsr,wrong=wavfile.read('/downloads/vireo-mismatched-wiki-12s-1740.wav');assert sr==wsr==16000
manifest=json.load(open('/home/sandbox/vireo-audio-binding-next/model-manifest.json'));models=Path('/home/sandbox/vireo-audio-binding-next/models')
for x in manifest:assert hashlib.sha256((models/x['name']).read_bytes()).hexdigest()==x['sha256']
opt=ort.SessionOptions();opt.intra_op_num_threads=1;opt.inter_op_num_threads=1;sessions={n:ort.InferenceSession(str(models/(n+'.onnx')),sess_options=opt,providers=['CPUExecutionProvider'])for n in ['audio_frontend','visual_frontend','av_backend']}
cap=cv2.VideoCapture(str(source));rows=[];crops=[];ids=sorted(set(f['track_id']for s in track['raw_samples']for f in s['faces']));assert len(ids)==4
for start in [1,5,9]:
 duration=1.6;frames=40;embeddings={}
 for identity in ids:
  video=[]
  for i in range(frames):
   t=start+i/25;near=min(track['raw_samples'],key=lambda s:abs(s['time']-t));assert abs(near['time']-t)<.2;face=next(f for f in near['faces']if f['track_id']==identity);cap.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,f=cap.read();assert ok and abs(cap.get(cv2.CAP_PROP_POS_MSEC)/1000-t)<.05
   h,w=f.shape[:2];x=(face['x']+face['width']/2)*w;y=(face['y']+face['height']/2)*h;r=max(face['width']*w,face['height']*h)/2;cs=.4;p=int(r*(1+2*cs));f=cv2.copyMakeBorder(f,p,p,p,p,cv2.BORDER_CONSTANT,value=(110,110,110));x+=p;y+=p;crop=f[int(y-r):int(y+r*(1+2*cs)),int(x-r*(1+cs)):int(x+r*(1+cs))];crop=cv2.resize(crop,(224,224));video.append(cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY)[56:168,56:168]);
   if i==15:crops.append(crop)
  embeddings[identity]=sessions['visual_frontend'].run(None,{'visual_feature':np.asarray(video,dtype=np.float32)[None]})[0]
 modes={}
 for mode,wave in [('source',audio),('muted',np.zeros_like(audio)),('independent-wrong',wrong)]:
  feature=mfcc(wave,sr,numcep=13,winlen=.025,winstep=.010)[round(start*100):round(start*100)+frames*4];assert len(feature)==frames*4
  ae=sessions['audio_frontend'].run(None,{'audio_feature':feature.astype(np.float32)[None]})[0];scores={}
  for identity,ve in embeddings.items():
   assert ae.shape==ve.shape;score=sessions['av_backend'].run(None,{'audio_embed':ae,'visual_embed':ve})[0].reshape(-1);assert np.isfinite(score).all();scores[identity]={'mean_raw':float(score.mean()),'positive_fraction':float(np.mean(score>=0)),'raw':score.tolist()}
  ranking=sorted(ids,key=lambda x:scores[x]['mean_raw'],reverse=True);modes[mode]={'ranking':ranking,'top_margin':scores[ranking[0]]['mean_raw']-scores[ranking[1]]['mean_raw'],'scores':scores}
 rows.append({'start':start,'duration':duration,'modes':modes})
cap.release();cv2.imwrite(str(out/'face-inputs.png'),np.vstack([np.hstack(crops[n:n+4])for n in range(0,len(crops),4)]));report={'scope':'relative same-audio simultaneous-face control, not calibrated accuracy or activation','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source_start_in_parent_seconds':12,'resolution':'426x240 transcode; small faces','audio_feature_windowing':'whole-wave MFCC then exact160-frame slice; no padded features','speaker_visual_note':'microphone and continuous visible speech at source-left second person; actual audio inspected, no human identity claim','ids':ids,'rows':rows,'model_manifest':manifest};(out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps([{'start':x['start'],'modes':{k:{'ranking':v['ranking'],'margin':v['top_margin'],'means':{i:round(a['mean_raw'],4)for i,a in v['scores'].items()}}for k,v in x['modes'].items()}}for x in rows],indent=2))
