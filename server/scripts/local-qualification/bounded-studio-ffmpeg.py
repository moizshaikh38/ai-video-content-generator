#!/usr/bin/python3
import os,sys,subprocess,time,json,signal
out=os.environ.get('VIREO_STUDIO_OUT','/downloads/vireo-studio-ordinary-0105')
def guard():
 disk=os.statvfs(out);free=disk.f_bavail*disk.f_frsize
 mem=int(open('/proc/meminfo').read().split('MemAvailable:')[1].split()[0])*1024
 size=sum(os.path.getsize(os.path.join(root,f)) for root,_,files in os.walk(out) for f in files)
 if free<256*1024*1024:return 'disk_floor'
 if mem<512*1024*1024:return 'shared_memory_floor'
 if size>20*1024*1024:return 'artifact_cap'
 return None
if guard():sys.exit('Resource preflight refused')
args=sys.argv[1:]
encode=any(a.endswith('.mp4') for a in args) and not args[-1:] == ['-'] and args[-1].endswith('.mp4')
if encode:
 countfile=out+'/encode-count'
 count=int(open(countfile).read()) if os.path.exists(countfile) else 0
 if count: sys.exit('Only one encode allowed')
 open(countfile,'w').write(str(count+1))
args=['-threads','1','-filter_threads','1','-filter_complex_threads','1']+args
if encode: args=args[:-1]+['-threads','1']+args[-1:]
p=subprocess.Popen(['/usr/bin/ffmpeg']+args)
start=time.monotonic();peak=0;breach=None
while p.poll() is None:
 try:
  status=open('/proc/%d/status'%p.pid).read();rss=int(status.split('VmRSS:')[1].split()[0])*1024;peak=max(peak,rss)
 except (FileNotFoundError,IndexError):pass
 resource=guard()
 if peak>256*1024*1024 or time.monotonic()-start>60 or resource:
  breach=resource or ('rss' if peak>256*1024*1024 else 'timeout');p.kill();break
 time.sleep(.01)
code=p.wait()
with open(out+'/ffmpeg-audit.jsonl','a') as f:f.write(json.dumps({'encode':encode,'args':args,'peakRssBytes':peak,'elapsedSeconds':time.monotonic()-start,'breach':breach,'exitCode':code})+'\n')
sys.exit(code if code>=0 else 1)
