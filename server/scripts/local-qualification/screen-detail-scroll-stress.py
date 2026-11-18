from pathlib import Path
import cv2,numpy as np,subprocess,json,sys,hashlib,os
root=Path(sys.argv[1]);root.mkdir(exist_ok=False)
c=cv2.VideoCapture('/downloads/vireo-screen-proposal-holdout-1546/screen-later30-38.mp4');ok,f=c.read();c.release();assert ok
# Controlled translation of existing screen pixels, not new natural scroll evidence.
h,w=f.shape[:2];writer=cv2.VideoWriter(str(root/'scroll-scratch.mp4'),cv2.VideoWriter_fourcc(*'mp4v'),30,(w,h))
for i in range(240):
 dy=-round(i*180/239);g=cv2.warpAffine(f,np.float32([[1,0,0],[0,1,dy]]),(w,h),borderMode=cv2.BORDER_CONSTANT,borderValue=(255,255,255));writer.write(g)
writer.release();subprocess.run(['ffmpeg','-v','error','-y','-i',str(root/'scroll-scratch.mp4'),'-an','-threads','1','-c:v','libx264','-preset','ultrafast',str(root/'controlled-scroll.mp4')],check=True);(root/'scroll-scratch.mp4').unlink()
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'python'));os.environ.update(SMART_REFRAME_YUNET_MODEL='/tmp/vireo-local-restore/models/yunet.onnx',SMART_REFRAME_YUNET_THRESHOLD='.85',SMART_REFRAME_PERSON_MODEL='/tmp/vireo-local-restore/models/nanodet.onnx')
for k in ['SMART_REFRAME_SOURCE_TEXT_OCR','SMART_REFRAME_TEXT_GEOMETRY_MODEL','SMART_REFRAME_AUTO_TEXT']:os.environ.pop(k,None)
from smart_reframe import analyze_video
s=root/'controlled-scroll.mp4';d=analyze_video(str(s),4,0,8,600,True,True);(root/'analysis.json').write_text(json.dumps(d));(root/'track.json').write_text(json.dumps({'metadata':{'analyzed_source_sha256':hashlib.sha256(s.read_bytes()).hexdigest(),'protected_content_regions':d['protected_content_regions']}}))
subprocess.run(['/tmp/vireo-local-restore/cv-env/bin/python',str(Path(__file__).with_name('screen-detail-review.py')),str(root/'review'),str(s),str(root/'track.json')],check=True);print(json.dumps({'coverage':d['source_text_coverage'],'episodes':json.load(open(root/'review/proposal.json'))['review_episodes']}))
