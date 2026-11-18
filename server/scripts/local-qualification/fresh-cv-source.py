"""Bounded offline source CV evidence. No install, download, provider or STT.
Usage: python fresh-cv-source.py SOURCE_MEDIA NEW_OUTPUT_DIR
Uses explicit restored local model/runtime paths unless VIREO_CV_* overrides.
"""
import hashlib,json,os,pathlib,subprocess,sys,time
source=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=False)
base=pathlib.Path(__file__).resolve().parents[3]
python=os.environ.get('VIREO_CV_PYTHON','/tmp/vireo-local-restore/cv-env/bin/python')
yunet=os.environ.get('VIREO_CV_YUNET_MODEL','/tmp/vireo-local-restore/models/yunet.onnx')
person=os.environ.get('VIREO_CV_PERSON_MODEL','/tmp/vireo-local-restore/models/nanodet.onnx')
script=base/'server/python/smart_reframe.py'
def sha(file):
 h=hashlib.sha256()
 with open(file,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
for f in [source,pathlib.Path(python),pathlib.Path(yunet),pathlib.Path(person),script]:
 if not f.is_file():raise ValueError('Required existing local source/runtime/model missing: '+str(f))
digest=sha(source);env=os.environ.copy();env.update(SMART_REFRAME_YUNET_MODEL=yunet,SMART_REFRAME_YUNET_THRESHOLD='.85',SMART_REFRAME_PERSON_MODEL=person,SMART_REFRAME_HSV_CUTS='1')
params=dict(videoPath=str(source),sampleFps=4,startSec=0,durationSec=12,maxSamples=60)
request=dict(params=params,sourceSha256=digest,python=python,configuration={k:v for k,v in env.items() if k.startswith('SMART_REFRAME')},modelSha256={yunet:sha(yunet),person:sha(person)},pythonSourceSha256={str(f):sha(f) for f in sorted(script.parent.glob('*.py'))})
(out/'request.json').write_text(json.dumps(request,indent=2));start=time.monotonic()
run=subprocess.run([python,str(script)],input=json.dumps(params),encoding='utf8',capture_output=True,env=env,timeout=90)
(out/'stdout.json').write_text(run.stdout);(out/'stderr.txt').write_text(run.stderr)
if run.returncode:raise RuntimeError('Local CV failed; inspect stderr/stdout in '+str(out))
r=json.loads(run.stdout)
if r.get('status')!='ok':raise RuntimeError('Local CV did not return success')
if sha(source)!=digest:raise RuntimeError('Source changed during analysis; reject this run')
manifest=dict(source=str(source),sourceSha256=digest,elapsedSeconds=time.monotonic()-start,sourceUnchanged=True,freshCvExecution=True,providerCalls=0,returncode=run.returncode,samples=r.get('sample_count'),sourceSize=[r.get('source_width'),r.get('source_height')],personDetector=r.get('person_detector'),semanticOrSpeakerIdentityQualified=False)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2));print(json.dumps(manifest))
