"""Shared bounded ingest geometry, reusing both existing measurements.
No semantic calls, fixed crop, confidence ranking or source-specific coordinates.
Completed unique color baseline is preserved; edge runs only with zero color candidates.
"""
import hashlib,json,sys
from measured_color_aperture_review import run as color_run
from measured_edge_aperture_review import run as edge_run

def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def choose(color,edge):
    # Closed color aperture is the existing baseline. Edge proposals are an
    # alternative only when no closed aperture was measured. Ambiguous edge
    # hypotheses are not evidence against a completed unique closed aperture.
    for branch in [color,edge]:
        if not isinstance(branch,dict) or branch.get('status') not in ['measured-rectangle','unresolved'] or not isinstance(branch.get('proposals'),list):
            raise ValueError('Geometry branch incomplete or malformed')
        if branch['status']=='measured-rectangle' and len(branch['proposals'])!=1:
            raise ValueError('Geometry branch status contradicts measurements')
    cp=color['proposals'];ep=edge['proposals']
    if color['status']=='measured-rectangle':
        if edge['status']=='measured-rectangle':
            a,b=cp[0]['box'],ep[0]['box']
            if max(abs(a[k]-b[k]) for k in ['x','y','w','h'])>.004:return None
        return color
    if cp:return None
    return edge if edge['status']=='measured-rectangle' else None

def run(source,track):
    before=digest(source)
    # Validate exact decoder dimensions/interval/hash independently, without
    # requiring the fallback detector to execute on existing color successes.
    import cv2,numpy as np
    cap=cv2.VideoCapture(source)
    try:
        fps=cap.get(cv2.CAP_PROP_FPS);duration=cap.get(cv2.CAP_PROP_FRAME_COUNT)/fps if fps>0 else float('nan')
        w,h=cap.get(cv2.CAP_PROP_FRAME_WIDTH),cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
        if not(np.isfinite(duration) and 6<=duration<=30 and w*h*min(32,max(8,int(duration)+1))<=12000000):raise ValueError('Geometry source budget')
        if track.get('source_sha256')!=before or track.get('source_width')!=w or track.get('source_height')!=h or track.get('source_start')!=0 or not np.isfinite(track.get('source_end',float('nan'))) or abs(track['source_end']-duration)>.001 or track.get('sample_clock')!='interval-relative':raise ValueError('Geometry face source binding')
    finally:cap.release()
    color=color_run(source,track)
    if color.get('status') not in ['measured-rectangle','unresolved'] or not isinstance(color.get('proposals'),list):raise ValueError('Color branch incomplete')
    edge={'status':'not-run-color-baseline','proposals':[]}
    if color['status']=='measured-rectangle' and len(color['proposals'])==1:selected=color
    elif color['status']=='unresolved' and len(color['proposals'])==0:
        edge=edge_run(source,track);selected=choose(color,edge)
    elif color['status']=='unresolved':selected=None
    else:raise ValueError('Color branch status contradicts measurements')
    if before!=digest(source):raise ValueError('Source changed during geometry')
    result=dict(selected or edge)
    if selected is None:result.update(status='unresolved',proposals=[])
    result['producer']='color-baseline-with-source-edge-fallback-v1'
    result['branch_status']={'color':color['status'],'edge':edge['status']}
    result['limits']=result.get('limits',[])+['Geometry only; independent semantic evidence and current source object verification remain required','Unique completed color baseline takes precedence over unresolved edge hypotheses; conflicting unique rectangles fail closed','Sparse measurements do not certify unseen boundaries, HUD or action safety']
    return result

if __name__=='__main__':
    receipt=run(sys.argv[1],json.load(open(sys.argv[2])))
    with open(sys.argv[3],'w') as f:json.dump(receipt,f,indent=2)
    print(json.dumps({'status':receipt['status'],'method':receipt.get('method'),'branches':receipt['branch_status']}))
