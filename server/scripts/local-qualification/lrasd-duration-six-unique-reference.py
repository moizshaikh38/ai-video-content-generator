import sys,json,glob,math,resource
sys.path.insert(0,'/tmp/p/src')
import torch,numpy as np,cv2
from scipy.io import wavfile
from scipy import signal
from scipy.interpolate import interp1d
from python_speech_features import mfcc
from model.Model import ASD_Model
from loss import lossAV
torch.set_num_threads(2)
sd=torch.load('/tmp/p/src/weight/finetuning_TalkSet.model',map_location='cpu',weights_only=True)
m=ASD_Model();l=lossAV()
m.load_state_dict({k[6:]:v for k,v in sd.items() if k.startswith('model.')},strict=True);l.load_state_dict({k[7:]:v for k,v in sd.items() if k.startswith('lossAV.')},strict=True);m.eval();l.eval()
fl=sorted(glob.glob('/tmp/l/fr/*.jpg'));N=len(fl)
det=cv2.FaceDetectorYN.create('/tmp/l/yunet.onnx','',(960,540),0.9,0.3,5000)
dets=[]
for i,f in enumerate(fl):
    img=cv2.imread(f);_,r=det.detect(img);d=[] if r is None else [[float(x) for x in row[:4]]+[float(row[14])] for row in r]
    dets.append(d)
cnt=[len(d) for d in dets];print('frames',N,'faces/frame hist',{c:cnt.count(c) for c in set(cnt)})
# single track: official-style IoU tracking; box x,y,w,h -> x1,y1,x2,y2
def iou(a,b):
    ix=max(0,min(a[2],b[2])-max(a[0],b[0]));iy=max(0,min(a[3],b[3])-max(a[1],b[1]));I=ix*iy;return I/((a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-I)
track=[]
for fi,d in enumerate(dets):
    for x,y,w,h,s in d:
        bb=[x,y,x+w,y+h]
        if not track: track.append((fi,bb))
        elif fi-track[-1][0]<=10 and iou(bb,track[-1][1])>.5 and fi!=track[-1][0]: track.append((fi,bb))
fr=np.array([t[0] for t in track]);bx=np.array([t[1] for t in track]);print('track det frames',len(track),'span',fr[0],fr[-1],'gaps>1',int((np.diff(fr)>1).sum()))
fi=np.arange(fr[0],fr[-1]+1);bi=np.stack([interp1d(fr,bx[:,k])(fi) for k in range(4)],1)
s=np.maximum(bi[:,3]-bi[:,1],bi[:,2]-bi[:,0])/2;cy=(bi[:,1]+bi[:,3])/2;cx=(bi[:,0]+bi[:,2])/2
s,cx,cy=[signal.medfilt(a,13) for a in (s,cx,cy)]
vid=[]
for k,f in enumerate(fi):
    img=cv2.imread(fl[f]);bs=s[k];cs=.4;p=int(bs*(1+2*cs));fp=np.pad(img,((p,p),(p,p),(0,0)),'constant',constant_values=110);my=cy[k]+p;mx=cx[k]+p
    face=fp[int(my-bs):int(my+bs*(1+2*cs)),int(mx-bs*(1+cs)):int(mx+bs*(1+cs))];g=cv2.cvtColor(cv2.resize(face,(224,224)),cv2.COLOR_BGR2GRAY);vid.append(g[56:168,56:168])
vid=np.asarray(vid,dtype=np.float32);t0=fi[0]/25;print('video frames',len(vid),'t0',t0,'box size px median',float(np.median(s*2)))
cv2.imwrite('/tmp/l/crops.jpg',np.hstack([vid[i].astype(np.uint8) for i in range(0,len(vid),max(1,len(vid)//10))][:10]))
sr,A=wavfile.read('/tmp/l/vireo-freedom-singleface-audio-1740.wav');_,Wr=wavfile.read('/tmp/l/vireo-mismatched-wiki-12s-1740.wav')
def seg(a,st,n): return a[round(st*sr):round(st*sr)+n]
def run(audio,video):
    af=mfcc(audio,sr,numcep=13,winlen=.025,winstep=.010)
    length=min((af.shape[0]-af.shape[0]%4)/100,video.shape[0]/25 if False else video.shape[0]/1)
    length=min((af.shape[0]-af.shape[0]%4)/100,video.shape[0]) # official line (bug-compatible): min(sec, frames)
    # official then slices by round(length*100) and round(length*25): use true seconds instead to keep alignment honest
    L=min((af.shape[0]-af.shape[0]%4)/100,video.shape[0]/25)
    af=af[:int(round(L*100))];vv=video[:int(round(L*25))]
    allS=[]
    for dur in sorted({1,1,1,2,2,2,3,3,4,5,6}):
        sc=[]
        with torch.no_grad():
            for i in range(int(math.ceil(L/dur))):
                a=torch.FloatTensor(af[i*dur*100:(i+1)*dur*100]).unsqueeze(0);v=torch.FloatTensor(vv[i*dur*25:(i+1)*dur*25]).unsqueeze(0)
                if a.shape[1]<4 or v.shape[1]<1: continue
                ea=m.forward_audio_frontend(a);ev=m.forward_visual_frontend(v);o=m.forward_audio_visual_backend(ea,ev);sc.extend(l.lossAV.forward(o,labels=None) if False else l.FC(o)[:,1].numpy())
        allS.append(sc)
    n=min(len(x) for x in allS);return np.round(np.mean([x[:n] for x in allS],0),1)
res={};base=None
nA=len(vid)
# audio for video frame i is at time t0+i/25 in the 12s excerpt audio
a_src=seg(A,t0,round(nA/25*sr))
conds={'source':a_src,'wrong-speech':seg(Wr,t0,round(nA/25*sr)),'muted':np.zeros_like(a_src)}
out={}
for n,a in conds.items():
    sc=run(a,vid);out[n]=sc;print(n,'n',len(sc),'mean %.3f pos %.3f'%(sc.mean(),(sc>0).mean()),flush=True)
for off in [-.5,-.25,.25,.5]:
    # interior-only unpadded: audio shifted by off seconds relative to video, both truncated to the overlap
    k=int(round(abs(off)*25));
    if off>0: v=vid[:nA-k];a=seg(A,t0+off,round((nA-k)/25*sr))
    else: kv=k+1;v=vid[kv:];a=seg(A,t0+kv/25+off,round((nA-kv)/25*sr))
    # off<0: video frames k.. paired with audio from t0+k/25+off  (audio earlier than video)
    sc=run(a,v);out['%+dms'%(off*1000)]=sc;print('%+dms'%(off*1000),'n',len(sc),'mean %.3f pos %.3f'%(sc.mean(),(sc>0).mean()),flush=True)
# paired diff on common-frame comparisons (source vs wrong, same frames)
n_=min(len(out['source']),len(out['wrong-speech']));d=out['source'][:n_]-out['wrong-speech'][:n_];print('source-wrong paired mean %.3f frac source>wrong %.3f frac equal %.3f'%(d.mean(),(d>0).mean(),(d==0).mean()))
tail=[round(float(x),3) for x in out['source'][::25]];print('source per-second',tail);print('wrong per-second',[round(float(x),3) for x in out['wrong-speech'][::25]])
json.dump({k:{'n':len(v),'mean':float(v.mean()),'pos':float((v>0).mean()),'scores':v.tolist()} for k,v in out.items()},open('/tmp/l/ens_set.json','w'))
print('rss',resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
