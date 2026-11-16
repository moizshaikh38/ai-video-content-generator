"""Experimental source-context camera inset boundary qualification, NOT production.
Requires two independently sampled contexts of the SAME source layout. Outputs
pixel-boundary evidence, not a semantic gameplay classification. Single-window
menu seams have known false candidates. No automatic product assignment yet.
Usage: python SCRIPT video1 detections1.json video2 detections2.json output.json
"""
import sys,json,cv2,numpy as np

def evidence(video, detections):
    samples=json.load(open(detections))['samples']
    if len(samples)<8 or any(len(s['faces'])!=1 for s in samples):
        raise ValueError('Requires >=8 samples with exactly one face in every sample')
    fs=[s['faces'][0] for s in samples]
    centers=np.array([[f['x']+f['width']/2,f['y']+f['height']/2] for f in fs])
    if np.max(np.ptp(centers,axis=0))>.06:raise ValueError('Face not spatially stable')
    face={k:float(np.median([f[k] for f in fs])) for k in ['x','y','width','height']}
    cap=cv2.VideoCapture(video);frames=[]
    for s in samples:
        cap.set(cv2.CAP_PROP_POS_MSEC,s['time']*1000);ok,frame=cap.read()
        if not ok:raise ValueError('Missing decoded sample')
        frames.append(frame.astype(np.float32))
    cap.release();arr=np.stack(frames);h,w=arr.shape[1:3]
    cx,cy=np.median(centers,axis=0)
    if not ((cx<.25 or cx>.75) and (cy<.35 or cy>.65)):
        raise ValueError('Only corner inset candidates supported; not general camera detection')
    flipx=cx>.5;flipy=cy>.5
    if flipx:arr=arr[:,:,::-1,:];face['x']=1-face['x']-face['width']
    if flipy:arr=arr[:,::-1,:,:];face['y']=1-face['y']-face['height']
    gx=np.median(np.mean(np.abs(arr[:,:,1:]-arr[:,:,:-1]),3),axis=0)
    gy=np.median(np.mean(np.abs(arr[:,1:]-arr[:,:-1]),3),axis=0)
    return gx,gy,face,w,h,flipx,flipy

def run(pairs):
    if len(pairs)<2:raise ValueError('Two source contexts required, single-context seam evidence unsafe')
    es=[evidence(*p) for p in pairs];base=es[0];_,_,f,w,h,fx,fy=base
    for e in es[1:]:
        if e[3:]!=base[3:]:raise ValueError('Source contexts dimensions/corner differ')
        if max(abs(e[2][k]-f[k]) for k in ['x','y','width','height'])>.025:
            raise ValueError('Source contexts camera geometry changed')
    xlo=int((f['x']+1.5*f['width'])*w);xhi=min(int(w*.45),int((f['x']+4.5*f['width'])*w))
    ylo=int((f['y']+1.5*f['height'])*h);yhi=min(int(h*.65),int((f['y']+3.5*f['height'])*h))
    scores=[]
    for x in range(xlo,xhi):
        for y in range(ylo,yhi):
            if not .6<x/y<2:continue
            ss=[]
            for gx,gy,*_ in es:
                vx=float(gx[:y,x].mean());vy=float(gy[y,:x].mean())
                ox=float(gx[y+5:min(h-1,y*2),x].mean());oy=float(gy[y,x+5:min(w-1,x*2)].mean())
                sx=max(0,vx-ox);sy=max(0,vy-oy);ss.append(2*sx*sy/(sx+sy+1e-6))
            scores.append((min(ss),x,y,ss))
    scores.sort(reverse=True);best=scores[0];v,x,y,ss=best
    runner=next((z for z in scores if abs(z[1]-x)>w*.025 or abs(z[2]-y)>h*.025),None)
    ratio=v/(runner[0]+1e-6) if runner else 0
    accepted=v>=12 and ratio>=1.12
    return {'status':'experimental_candidate' if accepted else 'ambiguous','not_production':True,
        'source_width':w,'source_height':h,'contexts':len(pairs),'minimum_seam_score':v,
        'distinct_candidate_margin':ratio,'context_scores':ss,'region':{'x':w-x if fx else 0,'y':h-y if fy else 0,'w':x,'h':y},
        'limits':['One genuine stream only','Corner inset only','Requires unchanged multi-context layout','Not a gameplay classifier','No product automatic assignment']}
if __name__=='__main__':
    args=sys.argv[1:];out=args[-1];r=run(list(zip(args[:-1:2],args[1:-1:2])));json.dump(r,open(out,'w'),indent=2);print(json.dumps(r))
