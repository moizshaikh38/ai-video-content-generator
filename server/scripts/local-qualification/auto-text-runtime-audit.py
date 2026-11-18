from pathlib import Path
import os,sys,time,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'python'))
os.environ.update(SMART_REFRAME_YUNET_MODEL='/tmp/vireo-local-restore/models/yunet.onnx',SMART_REFRAME_YUNET_THRESHOLD='.85',SMART_REFRAME_PERSON_MODEL='/tmp/vireo-local-restore/models/nanodet.onnx',SMART_REFRAME_HSV_CUTS='1')
for k in ['SMART_REFRAME_SOURCE_TEXT_OCR','SMART_REFRAME_TEXT_GEOMETRY_MODEL','SMART_REFRAME_AUTO_TEXT']:os.environ.pop(k,None)
from smart_reframe import analyze_video
from auto_text_budget import host_ocr_slot
from unittest.mock import patch
out=Path(sys.argv[1]if len(sys.argv)>1 else '/downloads/vireo-auto-text-runtime-1451');out.mkdir(exist_ok=False)
results=[]
for name,source,mode in [('walk','walking-in-sands-12s.mp4','on'),('studio','cottonbro-studio-12s.mp4','on'),('c3','c3-new-8s-1150.mp4','on'),('busy','screencast-new-8s-1217.mp4','busy'),('missing','screencast-new-8s-1217.mp4','missing'),('disabled','screencast-new-8s-1217.mp4','disabled')]:
 start=time.monotonic();args=('/downloads/recovered-source/'+source,4,0,12 if name in ['walk','studio']else 8,600,True,True)
 if mode=='busy':
  with host_ocr_slot():d=analyze_video(*args)
 elif mode=='missing':
  with patch('auto_text_budget.shutil.which',return_value=None):d=analyze_video(*args)
 elif mode=='disabled':
  with patch.dict(os.environ,{'SMART_REFRAME_AUTO_TEXT':'0'}):d=analyze_video(*args)
 else:d=analyze_video(*args)
 (out/(name+'.json')).write_text(json.dumps(d))
 result={'name':name,'elapsed':round(time.monotonic()-start,2),'coverage':d.get('source_text_coverage'),'samples':len(d.get('samples',[]))};results.append(result);print(json.dumps(result),flush=True)
(out/'summary.json').write_text(json.dumps(results,indent=2))
