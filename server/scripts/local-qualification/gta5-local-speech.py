"""Local same-source speech diagnostic. No normalization clock repair."""
import json,sys,hashlib,time,os
from pathlib import Path
from faster_whisper import WhisperModel
source=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(exist_ok=False,parents=True)
started=time.time()
model_name=sys.argv[3]if len(sys.argv)>3 else 'base'
assert model_name in ['base','small']
model=WhisperModel(model_name,device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,download_root='/tmp/vireo-local-speech-models')
segments,info=model.transcribe(str(source),beam_size=5,word_timestamps=True,condition_on_previous_text=False,vad_filter=False,temperature=0)
rows=[]
for s in segments:
 rows.append({'start':s.start,'end':s.end,'text':s.text,'avg_logprob':s.avg_logprob,'no_speech_prob':s.no_speech_prob,'compression_ratio':s.compression_ratio,'words':[{'word':w.word,'start':w.start,'end':w.end,'probability':w.probability}for w in s.words or []]})
words=[w for s in rows for w in s['words']]
result={'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'language':info.language,'language_probability':info.language_probability,'duration':info.duration,'text':''.join(s['text']for s in rows),'segments':rows,'words':words,'invalidClocks':[i for i,w in enumerate(words)if w['end']<=w['start']],'elapsed':time.time()-started,'model':'Systran/faster-whisper-'+model_name,'automaticLanguage':True,'source':str(source),'accuracyQualified':False}
json.dump(result,open(out/'raw.json','w'),indent=2);print(json.dumps(result,ensure_ascii=False))
