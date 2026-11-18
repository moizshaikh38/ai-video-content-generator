#!/usr/bin/python3
import os,sys,subprocess,time,json
out='/downloads/vireo-studio-fullcandidate-0216'
os.makedirs(out,exist_ok=True)
kind='cv' if os.path.basename(sys.argv[0]).startswith('bounded-full-cv') else 'ffmpeg'
def guard():
 d=os.statvfs(out);free=d.f_bavail*d.f_frsize
 mem=int(open('/proc/meminfo').read().split('MemAvailable:')[1].split()[0])*1024
 size=sum(os.path.getsize(os.path.join(root,f))for root,_,files in os.walk(out)for f in files)
 if free<512*1024*1024:return 'disk_floor'
 if mem<512*1024*1024:return 'shared_memory_floor'
 if size>128*1024*1024:return 'artifact_cap'
 return None
reason=guard()
if reason:sys.exit('Resource guard: '+reason)
args=sys.argv[1:];actual_cv=kind=='cv'and any(a.endswith('smart_reframe.py')for a in args)
encode=kind=='ffmpeg'and args and args[-1].endswith('.mp4')
if actual_cv or encode:
 marker=out+('/cv-count'if actual_cv else'/encode-count')
 if os.path.exists(marker):sys.exit('Only one qualification attempt allowed')
 open(marker,'w').write('1')
if kind=='ffmpeg':
 args=['-threads','1','-filter_threads','1','-filter_complex_threads','1']+args
 if encode:args=args[:-1]+['-threads','1']+args[-1:]
 executable='/usr/bin/ffmpeg';cap=256*1024*1024;deadline=90
else:executable='/tmp/vireo-local-restore/cv-env/bin/python';cap=512*1024*1024;deadline=60
child=subprocess.Popen([executable]+args)
start=time.monotonic();peak=0;breach=None
while child.poll()is None:
 try:
  text=open('/proc/%d/status'%child.pid).read();rss=int(text.split('VmRSS:')[1].split()[0])*1024;peak=max(peak,rss)
 except(FileNotFoundError,IndexError):pass
 reason=guard()
 if peak>cap or time.monotonic()-start>deadline or reason:
  breach=reason or('rss'if peak>cap else'timeout');child.kill();break
 time.sleep(.01)
code=child.wait()
with open(out+'/resource-audit.jsonl','a')as f:f.write(json.dumps({'kind':kind,'actualCv':actual_cv,'encode':encode,'args':args,'peakRssBytes':peak,'elapsedSeconds':time.monotonic()-start,'breach':breach,'exitCode':code})+'\n')
sys.exit(code if code>=0 else 1)
