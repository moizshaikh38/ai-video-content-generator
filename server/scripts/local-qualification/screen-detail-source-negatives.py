from pathlib import Path
import os,sys,json,hashlib,subprocess,time
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'python'))
os.environ.update(SMART_REFRAME_YUNET_MODEL='/tmp/vireo-local-restore/models/yunet.onnx',SMART_REFRAME_YUNET_THRESHOLD='.85',SMART_REFRAME_PERSON_MODEL='/tmp/vireo-local-restore/models/nanodet.onnx',SMART_REFRAME_HSV_CUTS='1')
for k in ['SMART_REFRAME_SOURCE_TEXT_OCR','SMART_REFRAME_TEXT_GEOMETRY_MODEL','SMART_REFRAME_AUTO_TEXT']:os.environ.pop(k,None)
from smart_reframe import analyze_video
out=Path(sys.argv[1]);out.mkdir(exist_ok=False)
source=out/'screen-later30-38.mp4'
subprocess.run(['ffmpeg','-v','error','-y','-ss','30','-i','/downloads/recovered-source/screencast-original-1217.mp4','-t','8','-vf','scale=960:540','-an','-threads','1','-c:v','libx264','-preset','ultrafast','-crf','25',str(source)],check=True)
for name,p in [('screen-later',source),('freedom',Path('/downloads/recovered-source/freedom-new-8s-1150.mp4')),('erica',Path('/downloads/vireo-erica-av-1513.mp4'))]:
 began=time.monotonic();d=analyze_video(str(p),4,0,8,600,True,True);track={'metadata':{'analyzed_source_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'protected_content_regions':d['protected_content_regions']}};t=out/(name+'-track.json');t.write_text(json.dumps(track));(out/(name+'-analysis.json')).write_text(json.dumps(d));r=out/(name+'-review')
 subprocess.run(['/tmp/vireo-local-restore/cv-env/bin/python',str(Path(__file__).with_name('screen-detail-review.py')),str(r),str(p),str(t)],check=True)
 summary={'name':name,'seconds':round(time.monotonic()-began,2),'coverage':d['source_text_coverage'],'episodes':json.load(open(r/'proposal.json'))['review_episodes']};print(json.dumps(summary),flush=True)
