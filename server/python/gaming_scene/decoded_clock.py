"""Bounded native RGB frames and original PTS from the SAME ffmpeg decode.
No frame insertion, retiming, timestamp interpolation or coverage repair.
"""
import math
import queue
import re
import subprocess
import threading
from fractions import Fraction
import numpy as np


def coverage(times, start, end, fps):
    valid = (all(math.isfinite(v) for v in [start, end, fps]) and
             0 <= start < end and fps > 0 and bool(times) and
             all(math.isfinite(t) and start <= t < end for t in times) and
             all(b > a for a, b in zip(times, times[1:])))
    leading = max(0., times[0] - start) if times else end-start
    trailing = max(0., end - times[-1]) if times else end-start
    gap = max((b-a for a, b in zip(times, times[1:])), default=0.)
    complete = bool(valid and leading <= 1.1/fps and trailing <= 2.1/fps and gap <= 2.1/fps)
    return dict(method='same-decode-original-pts-v1', sourceStart=start, sourceEnd=end,
                frameCount=len(times), firstPresentationTime=times[0] if times else None,
                lastPresentationTime=times[-1] if times else None,
                leadingUncoveredSeconds=leading, trailingUncoveredSeconds=trailing,
                maximumPresentationGap=gap, clockCoverageVerified=complete)


def decoded_frames(source, start, end, width, height, timeout=60):
    """Yield (original source PTS, RGB ndarray), fail on missing/extra clocks.

    A one-second seek preroll/tail bounds input decoding, while trim selects the
    exact original source interval. showinfo is after trim and format, directly
    before rawvideo. A draining thread prevents stderr/stdout pipe deadlocks.
    """
    if not (all(math.isfinite(v) for v in [start,end,width,height,timeout]) and
            0 <= start < end and end-start <= 30 and width > 0 and height > 0 and
            int(width)==width and int(height)==height and width*height <= 1920*1080 and timeout>0):
        raise ValueError('Invalid bounded native decode request')
    width,height=int(width),int(height)
    seek=max(0.,start-1.)
    cmd=['ffmpeg','-nostdin','-hide_banner','-loglevel','info','-copyts','-threads','1',
         '-seek_timestamp','1','-ss',str(seek),'-noaccurate_seek','-t',str(end-seek+1.),'-i',source,'-map','0:v:0','-an',
         '-vf',f'trim=start={start}:end={end},format=rgb24,showinfo',
         '-threads','1','-vsync','0','-f','rawvideo','pipe:1']
    p=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    clocks=queue.Queue(); errors=[]; expired=threading.Event()
    pattern=re.compile(r'\bn:\s*(\d+)\s+pts:\s*(-?\d+)\s+pts_time:')
    base_pattern=re.compile(r'config in time_base:\s*(\d+/\d+)')
    size_pattern=re.compile(r'\bs:(\d+)x(\d+)\b')
    def drain():
        base=None
        try:
            for raw in p.stderr:
                line=raw.decode('utf8','replace');m=pattern.search(line)
                b=base_pattern.search(line)
                if b:base=Fraction(b.group(1))
                if m:
                    shape=size_pattern.search(line)
                    good_shape=shape is not None and (int(shape.group(1)),int(shape.group(2)))==(width,height)
                    clocks.put((int(m.group(1)),float(int(m.group(2))*base) if base is not None and good_shape else float('nan')))
                elif len(errors)<20 and ('error' in line.lower() or 'invalid' in line.lower()):errors.append(line.strip())
        finally:clocks.put(None)
    thread=threading.Thread(target=drain,daemon=True);thread.start()
    def stop():
        expired.set()
        if p.poll() is None:p.kill()
    timer=threading.Timer(timeout,stop);timer.start();index=0;previous=None;size=width*height*3
    try:
        while True:
            parts=[];remaining=size
            while remaining:
                chunk=p.stdout.read(remaining)
                if not chunk:break
                parts.append(chunk);remaining-=len(chunk)
            data=b''.join(parts)
            if not data:break
            if remaining:raise ValueError('Partial decoded RGB frame')
            clock=clocks.get(timeout=max(1.,timeout))
            if clock is None or clock[0]!=index:raise ValueError('Missing or unordered same-decode frame clock')
            pts=clock[1]
            if not math.isfinite(pts) or not start <= pts < end or (previous is not None and pts<=previous):
                raise ValueError('Invalid original presentation clock')
            previous=pts;index+=1
            yield pts,np.frombuffer(data,np.uint8).reshape(height,width,3)
        rc=p.wait();thread.join(timeout=2)
        if expired.is_set():raise TimeoutError('Bounded native decode timeout')
        if rc:raise ValueError('Native decode failed: '+'; '.join(errors))
        if thread.is_alive():raise ValueError('Native clock drain did not finish')
        if clocks.get(timeout=1) is not None:raise ValueError('Decoded clock without corresponding pixels')
    finally:
        timer.cancel()
        if p.poll() is None:p.kill()
        p.wait();p.stdout.close();p.stderr.close();thread.join(timeout=2)
