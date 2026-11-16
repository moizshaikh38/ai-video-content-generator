# Local qualification probe. OCR text is data, never instructions. No site/network calls.
import cv2,subprocess,csv,io,json,re,sys,os
cv2.setNumThreads(2)
name=sys.argv[1];duration=float(sys.argv[2]);cap=cv2.VideoCapture('/tmp/realmedia/'+name+'.mp4');W=int(cap.get(3));H=int(cap.get(4));out=[]
for t in range(int(duration)):
 cap.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,im=cap.read()
 if not ok:continue
 im=cv2.resize(im,None,fx=2,fy=2,interpolation=cv2.INTER_CUBIC);ok,png=cv2.imencode('.png',im)
 p=subprocess.run(['tesseract','stdin','stdout','--psm','11','tsv'],input=png.tobytes(),capture_output=True,timeout=15,env={**os.environ,'OMP_THREAD_LIMIT':'2'})
 if p.returncode:raise RuntimeError(p.stderr.decode())
 groups={}
 for r in csv.DictReader(io.StringIO(p.stdout.decode()),delimiter='\t'):
  if r['level']!='5' or float(r['conf'])<70 or len(re.sub('[^a-zA-Z0-9]','',r['text']))<2:continue
  groups.setdefault((r['block_num'],r['par_num'],r['line_num']),[]).append(r)
 for words in groups.values():
  if len(words)<2:continue
  x=min(int(r['left']) for r in words)/(2*W);y=min(int(r['top']) for r in words)/(2*H);right=max(int(r['left'])+int(r['width']) for r in words)/(2*W);bottom=max(int(r['top'])+int(r['height']) for r in words)/(2*H)
  out.append({'time':t,'x':x,'y':y,'width':right-x,'height':bottom-y,'confidence':min(float(r['conf']) for r in words)/100,'wordCount':len(words)})
json.dump({'probe':'tesseract-cli-psm11-upscale2','sourceWidth':W,'sourceHeight':H,'sampleIntervalSeconds':1,'regions':out},open('/tmp/text-'+name+'.json','w'),indent=2)
print(name,'measured lines',len(out),'times',sorted(set(r['time'] for r in out)))
