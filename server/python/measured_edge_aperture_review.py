"""Offline single-source-edge aperture candidate. Not wired to normal Auto.

One actual source boundary can bound a clipped inset. The other three sides
must have measured image gradients. Genre, real-person identity, active speaker
and game/HUD safety are not established by these lines or face candidates.
"""
import cv2
import numpy as np
import hashlib
import json
import sys


def _clusters(values, tolerance=3):
    groups=[]
    for value in sorted(set(values)):
        if not groups or value-groups[-1][-1]>tolerance:
            groups.append([value])
        else:
            groups[-1].append(value)
    return [round(float(np.median(group))) for group in groups]


def _edges(frame):
    pixels=frame.astype(np.int16)
    edges=np.zeros(frame.shape[:2],np.uint8)
    edges[:,1:]=(np.max(np.abs(pixels[:,1:]-pixels[:,:-1]),axis=2)>35)*255
    edges[1:]=np.maximum(edges[1:],(np.max(np.abs(pixels[1:]-pixels[:-1]),axis=2)>35)*255)
    return edges


def _coverage(edges, box, implicit_side):
    h,w=edges.shape
    x,y=round(box['x']*w),round(box['y']*h)
    xx=x+round(box['w']*w)-1
    yy=y+round(box['h']*h)-1
    band=max(2,round(min(w,h)*.006))
    sides=[edges[max(0,y-band):min(h,y+band+1),x:xx+1].max(0),
           edges[max(0,yy-band):min(h,yy+band+1),x:xx+1].max(0),
           edges[y:yy+1,max(0,x-band):min(w,x+band+1)].max(1),
           edges[y:yy+1,max(0,xx-band):min(w,xx+band+1)].max(1)]
    return [1. if i==implicit_side else float((side>0).mean()) for i,side in enumerate(sides)]


def discover(edges):
    h,w=edges.shape
    lines=cv2.HoughLinesP(edges,1,np.pi/180,threshold=35,
                         minLineLength=min(w,h)*.06,maxLineGap=6)
    horizontal=[]
    vertical=[]
    if lines is not None:
        for x1,y1,x2,y2 in lines[:,0,:]:
            if abs(y2-y1)<=2 and abs(x2-x1)>=w*.06:
                horizontal.append(round((int(y1)+int(y2))/2))
            if abs(x2-x1)<=2 and abs(y2-y1)>=h*.06:
                vertical.append(round((int(x1)+int(x2))/2))
    ys,xs=_clusters(horizontal),_clusters(vertical)
    combinations=(len(ys)*(len(ys)-1)//2*len(xs)+len(xs)*(len(xs)-1)//2*len(ys))*2
    if combinations>20000:
        return {'status':'line-budget-rejected','boxes':[]}
    boxes=[]
    def candidate(x,y,xx,yy,implicit_side):
        rw,rh=xx-x+1,yy-y+1
        if not(.008<=rw*rh/(w*h)<=.2 and .06<=rw/w<=.5 and .06<=rh/h<=.5 and .6<=rw/rh<=2.4):
            return
        box={'x':x/w,'y':y/h,'w':rw/w,'h':rh/h}
        coverage=_coverage(edges,box,implicit_side)
        if min(coverage)>=.7:
            boxes.append({'box':box,'implicit_source_edge':implicit_side,'edge_coverage':coverage})
    for i,y in enumerate(ys):
        for yy in ys[i+1:]:
            for x in xs:
                candidate(0,y,x,yy,2)
                candidate(x,y,w-1,yy,3)
    for i,x in enumerate(xs):
        for xx in xs[i+1:]:
            for y in ys:
                candidate(x,0,xx,y,0)
                candidate(x,y,xx,h-1,1)
    return {'status':'observed-lines','boxes':boxes}


def run(video,track):
    cap=cv2.VideoCapture(video)
    try:
        fps=cap.get(cv2.CAP_PROP_FPS)
        duration=cap.get(cv2.CAP_PROP_FRAME_COUNT)/fps if fps>0 else float('nan')
        width,height=cap.get(cv2.CAP_PROP_FRAME_WIDTH),cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
        if not(np.isfinite(duration) and 6<=duration<=30 and width>0 and height>0):
            raise ValueError('Only bounded6to30second local review')
        count=min(32,max(8,int(duration)+1))
        if width*height*count>12000000:
            raise ValueError('Local review pixel budget exceeded')
        samples=track['raw_samples']
        if any(not np.isfinite(s.get('time',float('nan'))) or not 0<=s['time']<duration or
               (i>0 and s['time']<=samples[i-1]['time']) for i,s in enumerate(samples)):
            raise ValueError('Face sample clock outside source review or not strictly increasing')
        rows=[]
        candidates=[]
        for t in np.linspace(0,max(0,duration-.1),count):
            cap.set(cv2.CAP_PROP_POS_MSEC,float(t)*1000)
            ok,frame=cap.read()
            if not ok:
                continue
            edges=_edges(frame)
            measured=discover(edges)
            if measured['status']=='line-budget-rejected':
                raise ValueError('Local review line budget exceeded; no winner selected')
            rows.append({'time':float(t),'edges':edges,'discovery_status':measured['status']})
            for candidate in measured['boxes']:
                if not any(candidate['implicit_source_edge']==q['implicit_source_edge'] and
                           max(abs(candidate['box'][k]-q['box'][k]) for k in candidate['box'])<.004
                           for q in candidates):
                    candidates.append(candidate)
            if len(candidates)>64:
                raise ValueError('Local review candidate budget exceeded; no winner selected')
    finally:
        cap.release()
    proposals=[]
    for candidate in candidates:
        box=candidate['box']
        coverage=[{'time':row['time'],'sides':_coverage(row['edges'],box,candidate['implicit_source_edge'])} for row in rows]
        observed=sum(min(row['sides'])>=.7 for row in coverage)
        if observed<max(6,len(rows)*.85):
            continue
        anchors=[]
        competing=False
        for sample in samples:
            faces=[f for f in sample['faces'] if isinstance(f.get('track_id'),str) and f['track_id'] and
                   all(np.isfinite(f.get(k,float('nan'))) for k in ['x','y','width','height','confidence']) and
                   .8<=f['confidence']<=1 and f['width']>0 and f['height']>0 and
                   f['x']>=box['x'] and f['y']>=box['y'] and
                   f['x']+f['width']<=box['x']+box['w'] and f['y']+f['height']<=box['y']+box['h']]
            competing=competing or len(faces)>1
            if len(faces)==1:
                anchors.append({'time':sample['time'],'track_id':faces[0]['track_id']})
        if competing or len(anchors)<max(6,len(samples)*.25) or len({a['track_id'] for a in anchors})!=1:
            continue
        proposals.append({**candidate,'anchor_samples':len(anchors),'anchor_observations':anchors,
                          'observed_frames':observed,'sampled_frames':len(rows),'coverage':coverage})
    with open(video,'rb') as source:
        digest=hashlib.sha256()
        for chunk in iter(lambda:source.read(1024*1024),b''):
            digest.update(chunk)
    return {'schema_version':4,'local_review_only':True,'not_genre_proof':True,'not_real_person_proof':True,
            'source_sha256':digest.hexdigest(),'source_start':0,'source_end':duration,'duration_seconds':duration,
            'sample_clock':'interval-relative','method':'one-source-edge-lines-review-v1',
            'status':'measured-rectangle' if len(proposals)==1 else 'unresolved','proposals':proposals,
            'observations':[{'time':r['time'],'discovery_status':r['discovery_status']} for r in rows],
            'limits':['Offline candidate only; not wired to normal Auto or the review ingest service',
                      'An actual source boundary replaces only that unobservable image side',
                      'Three other measured gradient sides, temporal recurrence and one stable face-candidate track required',
                      'No color, real-person, speaker, role, action/HUD or unseen-motion safety proof',
                      'Crossing or nested remaining proposals are unresolved; no scalar winner selected']}


if __name__=='__main__':
    receipt=run(sys.argv[1],json.load(open(sys.argv[2])))
    json.dump(receipt,open(sys.argv[3],'w'),indent=2)
    print(json.dumps({'status':receipt['status'],'proposals':len(receipt['proposals'])}))
