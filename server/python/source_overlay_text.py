"""Local qualification: high-saturation numeric overlays, not all text/action.

This detector only reports OCR-confirmed clock-like text in the upper frame.
Absence is unknown. No claim that all important content has been detected.
"""
import cv2, subprocess, tempfile, csv, io, re, os, json, sys

def clock_overlay(frame):
    h,w=frame.shape[:2]
    roi=frame[:round(h*.22)]
    hsv=cv2.cvtColor(roi,cv2.COLOR_BGR2HSV)
    mask=cv2.inRange(hsv,(0,80,150),(179,255,255))
    count,labels,stats,_=cv2.connectedComponentsWithStats(mask)
    # Remove enclosing outlines and large scenic color blocks. Digits/colon
    # remain separate components. Numeric OCR still must confirm the shape.
    for i in range(1,count):
        x,y,bw,bh,area=stats[i]
        if bw>w*.2 or bh>h*.13 or area<3:
            mask[labels==i]=0
    with tempfile.TemporaryDirectory() as d:
        path=os.path.join(d,'mask.png')
        cv2.imwrite(path,255-cv2.resize(mask,None,fx=3,fy=3))
        p=subprocess.run(['tesseract',path,'stdout','--psm','11','-c','tessedit_char_whitelist=0123456789:','tsv'],capture_output=True,text=True,timeout=4,check=True)
    results=[]
    for r in csv.DictReader(io.StringIO(p.stdout),delimiter='\t'):
        if re.fullmatch(r'\d{1,2}:\d{2}:\d{2}',r.get('text','')) and float(r['conf'])>=70:
            x,y,bw,bh=[float(r[k])/3 for k in ('left','top','width','height')]
            results.append({'x':max(0,(x-10)/w),'y':max(0,(y-10)/h),'width':min(1,(bw+20)/w),'height':min(1,(bh+20)/h),'confidence':float(r['conf'])/100,'kind':'numeric-clock-overlay','text':r['text']})
    return results

if __name__=='__main__':
    result=[]
    for i,path in enumerate(sorted(__import__('glob').glob(sys.argv[1]))):
        for r in clock_overlay(cv2.imread(path)):
            result.append({**r,'start':max(0,i*.5-.3),'end':i*.5+.3})
    print(json.dumps(result))
