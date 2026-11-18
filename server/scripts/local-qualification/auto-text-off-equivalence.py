from pathlib import Path
import sys,os,json,time
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'python'))
os.environ.update(SMART_REFRAME_YUNET_MODEL='/tmp/vireo-local-restore/models/yunet.onnx',SMART_REFRAME_YUNET_THRESHOLD='.85',SMART_REFRAME_PERSON_MODEL='/tmp/vireo-local-restore/models/nanodet.onnx',SMART_REFRAME_HSV_CUTS='1')
for k in ['SMART_REFRAME_SOURCE_TEXT_OCR','SMART_REFRAME_TEXT_GEOMETRY_MODEL','SMART_REFRAME_AUTO_TEXT']:os.environ.pop(k,None)
from smart_reframe import analyze_video
from pathlib import Path
out=Path(sys.argv[1]if len(sys.argv)>1 else '/downloads/vireo-auto-text-runtime-1451');summary=[]
for name,source in [('walk','walking-in-sands-12s.mp4'),('studio','cottonbro-studio-12s.mp4')]:
 a=json.loads((out/(name+'.json')).read_text());b=json.loads(json.dumps(analyze_video('/downloads/recovered-source/'+source,4,0,12,600,True,False)))
 keys=set(a)|set(b);differences=[k for k in sorted(keys)if a.get(k)!=b.get(k)]
 summary.append({'name':name,'differing_top_level_fields':differences,'face_samples_identical':a['samples']==b['samples'],'protected_regions_identical':a['protected_content_regions']==b['protected_content_regions']})
(out/'off-equivalence.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
