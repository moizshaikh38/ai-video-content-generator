"""Lossless measurement provenance, not face identity/role verification."""
import math

def candidate_evidence(detector, raw_box, width, height, score=None, landmarks=None):
    box=[float(v) for v in raw_box]
    if len(box)!=4 or not all(math.isfinite(v) for v in box) or min(box[2:])<=0:
        raise ValueError('invalid detector rectangle')
    x,y,w,h=box
    result=dict(schema_version=1,detector=detector,coordinate_space='source-pixels',
        source_width=int(width),source_height=int(height),raw_box=box,
        clipped=dict(left=x<0,top=y<0,right=x+w>width,bottom=y+h>height),
        verification=dict(state='unknown',reason='detector-candidate-only'))
    if score is not None and math.isfinite(float(score)):result['raw_score']=float(score)
    if landmarks is not None:
        names=['right_eye','left_eye','nose','right_mouth','left_mouth']
        if len(landmarks)==10 and all(math.isfinite(float(v)) for v in landmarks):
            result['landmarks']=[dict(name=n,x=float(landmarks[2*i]),y=float(landmarks[2*i+1])) for i,n in enumerate(names)]
    return result
