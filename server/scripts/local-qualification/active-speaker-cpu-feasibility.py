"""Private, isolated model feasibility only. No product import, no network.
Preprocessing follows MIT Light-ASD crop/25fps/16kHz conventions; no measured
quality equivalence asserted for our YuNet boxes or this fork's weights.
"""
from pathlib import Path
import sys,os,json,time,hashlib,resource
runtime_root=Path(os.environ.get('VIREO_ASD_EVAL_ROOT','/home/sandbox/vireo-asd-cpu-eval'))
sys.path.insert(0,str(runtime_root/'runtime'))
import cv2,numpy as np,onnxruntime as ort
from scipy.io import wavfile
from python_speech_features import mfcc
root=runtime_root;out=Path(sys.argv[1]);out.mkdir(exist_ok=False)
source=Path('/downloads/vireo-erica-av-1513.mp4');track=json.load(open('/downloads/vireo-auto-erica-av-ui-1514/fresh-normal-track.json'));samples=track['raw_samples'];sr,audio=wavfile.read('/downloads/vireo-erica-av-1513.wav');assert sr==16000 and audio.ndim==1
assert track['metadata']['analyzed_source_sha256']==hashlib.sha256(source.read_bytes()).hexdigest()
expected={'lightASD.onnx':'87929633815be81d18d042afac609ff6ef650719c29c2d5efd2dfb1de4de8f35','lossAV.onnx':'2bcca3110f7cdae267398deeb3080032f2cc952ccf0f565e6341808704743b41'}
for name,digest in expected.items():assert hashlib.sha256((root/'models'/name).read_bytes()).hexdigest()==digest
opt=ort.SessionOptions();opt.intra_op_num_threads=1;opt.inter_op_num_threads=1
model=ort.InferenceSession(str(root/'models/lightASD.onnx'),sess_options=opt,providers=['CPUExecutionProvider']);head=ort.InferenceSession(str(root/'models/lossAV.onnx'),sess_options=opt,providers=['CPUExecutionProvider'])
cap=cv2.VideoCapture(str(source));results=[];boards=[]
context_sweep='--context-sweep'in sys.argv[2:]
windows=[(1.5,'subject_2'),(3.4,'subject_3'),(10.3,'subject_5')]if context_sweep else [(0,'subject_1'),(1.5,'subject_2'),(3.5,'subject_3'),(10.3,'subject_5')]
duration=1.6 if context_sweep else 1.2;video_frames=round(duration*25);audio_frames=video_frames*4
for start,identity in windows:
 frames=[];bgr=[];decoded_times=[]
 assert not any(start<c<start+duration for c in track['metadata']['scene_cuts'])
 for i in range(video_frames):
  t=start+i/25;candidates=[s for s in samples if any(f.get('track_id')==identity for f in s['faces'])];near=min(candidates,key=lambda s:abs(s['time']-t));faces=[f for f in near['faces']if f.get('track_id')==identity];assert len(faces)==1 and abs(near['time']-t)<.2
  cap.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,f=cap.read();assert ok
  decoded=cap.get(cv2.CAP_PROP_POS_MSEC)/1000;assert abs(decoded-t)<.05;decoded_times.append(decoded)
  h,w=f.shape[:2];box=faces[0];x=(box['x']+box['width']/2)*w;y=(box['y']+box['height']/2)*h;r=max(box['width']*w,box['height']*h)/2;cs=.4
  p=int(r*(1+2*cs));f=cv2.copyMakeBorder(f,p,p,p,p,cv2.BORDER_CONSTANT,value=(110,110,110));x+=p;y+=p
  crop=f[int(y-r):int(y+r*(1+2*cs)),int(x-r*(1+cs)):int(x+r*(1+cs))];crop=cv2.resize(crop,(224,224));g=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY)[56:168,56:168];frames.append(g)
  if i==15:bgr.append(crop)
 video=np.asarray(frames,dtype=np.float32)[None];wave=audio[round(start*sr):round((start+duration)*sr)]
 wavfile.write(str(out/('audio-'+identity+'.wav')),sr,wave)
 modes={}
 conditions=[('source',wave),('muted',np.zeros_like(wave))]
 if context_sweep:
  conditions.append(('wrong-window',audio[round(1.5*sr):round((1.5+duration)*sr)]))
  conditions.extend((str(offset)+'ms',audio[round((start+offset/1000)*sr):round((start+offset/1000+duration)*sr)])for offset in [-500,-250,250,500])
 else:conditions.append(('offset500ms',audio[round((start+.5)*sr):round((start+.5+duration)*sr)]))
 for mode,waveform in conditions:
  if len(waveform)!=len(wave):continue
  feature=mfcc(waveform,sr,numcep=13,winlen=.025,winstep=.010);feature=feature[:audio_frames]
  if len(feature)<audio_frames:feature=np.pad(feature,((0,audio_frames-len(feature)),(0,0)),mode='edge')
  began=time.monotonic();embedding=model.run(None,{'audio':feature.astype(np.float32)[None],'visual':video})[0];score=head.run(None,{head.get_inputs()[0].name:embedding})[0].reshape(-1)
  assert np.isfinite(score).all() and len(score)==video_frames
  modes[mode]={'frames':len(score),'mean_raw_score':round(float(score.mean()),4),'positive_frame_fraction':round(float(np.mean(score>=0)),4),'seconds':round(time.monotonic()-began,4),'raw_score':score.tolist()}
 results.append({'relative_start_seconds':start,'duration':duration,'face_track':identity,'actual_decoded_times':decoded_times,'scores':modes});boards.extend(bgr)
cap.release();cv2.imwrite(str(out/'input-face-crops.png'),np.hstack(boards))
report={'scope':'Controlled CPU feasibility only, not calibrated active-speaker accuracy, no camera activation','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source_excerpt_original_start_seconds':30,'sample_fps':25,'audio_rate':sr,'identity_cross_cut':'never-linked','context_sweep':context_sweep,'providers':model.get_providers(),'model_manifest':json.load(open(root/'model-manifest.json')),'max_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'results':results}
(out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items()if k!='results'}));print(json.dumps([{**r,'scores':{m:{k:v for k,v in s.items()if k!='raw_score'}for m,s in r['scores'].items()}}for r in results]))
