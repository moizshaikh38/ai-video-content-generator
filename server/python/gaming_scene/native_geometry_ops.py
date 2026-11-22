import numpy as np

def long_runs(mask:np.ndarray,min_length:int,horizontal:bool=True)->np.ndarray:
    """Keep complete axis-aligned true runs, without SciPy or image resizing."""
    a=mask if horizontal else mask.T
    padded=np.pad(a,((0,0),(1,1)),constant_values=False)
    rows,starts=np.nonzero(~padded[:,:-1]&padded[:,1:])
    erows,ends=np.nonzero(padded[:,:-1]&~padded[:,1:])
    assert np.array_equal(rows,erows)
    keep=ends-starts>=min_length
    changes=np.zeros((a.shape[0],a.shape[1]+1),dtype=np.int8)
    changes[rows[keep],starts[keep]]=1
    changes[rows[keep],ends[keep]]=-1
    opened=np.cumsum(changes[:,:-1],axis=1,dtype=np.int16)>0
    return opened if horizontal else opened.T

def lines(mask,horizontal):
    h,w=mask.shape
    opened=long_runs(mask,max(10,round((w if horizontal else h)*.04)),horizontal)
    selected=np.flatnonzero(opened.sum(axis=1 if horizontal else 0)>=(w*.06 if horizontal else h*.06))
    groups=np.split(selected,np.flatnonzero(np.diff(selected)>1)+1)
    return sorted(set(int(v) for g in groups if len(g) for v in (g[0],g[-1])))

def candidate_roi(rectangles,width,height,band):
    assert rectangles and band>=1
    return (max(0,min(r[0] for r in rectangles)-band-1),max(0,min(r[1] for r in rectangles)-band-1),min(width,max(r[2] for r in rectangles)+band+2),min(height,max(r[3] for r in rectangles)+band+2))


def digest_file(path):
    import hashlib
    h=hashlib.sha256()
    with open(path,'rb') as f:
        while True:
            chunk=f.read(1024*1024)
            if not chunk:break
            h.update(chunk)
    return h.hexdigest()

def presentation_times(source,start,end):
    import subprocess,json
    # Seek to the interval and include one second of decoder tail, then select
    # only requested presentation times. Never probe every frame of a long source.
    raw=subprocess.check_output(['ffprobe','-v','error','-read_intervals',f'{start}%{end+1}','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',source],timeout=15)
    frames=json.loads(raw)['frames']
    return [float(f['best_effort_timestamp_time']) for f in frames if 'best_effort_timestamp_time' in f and start-1e-6<=float(f['best_effort_timestamp_time'])<end-1e-6]
