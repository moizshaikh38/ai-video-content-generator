"""Build frame-stepped preview/export evidence for caption-motion-frames.cjs.
No accuracy/parity verdict. Explicit export MP4 and capture directory arguments.
The left video concatenates requested source0-4and18-22seconds at30fps.
"""
import json,pathlib,subprocess,sys
from PIL import Image,ImageDraw
export=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2])
state=json.loads((out/'preview-states.json').read_text())
if len(state['states'])!=240:raise ValueError('A full240-frame capture is required')
if any(abs(row['videoTime']-row['t'])>.002 for row in state['states']):raise ValueError('Capture timestamp disagreement')
if (out/'paired.mp4').exists():raise ValueError('Do not overwrite prior paired evidence')
def ff(*args):subprocess.run(['ffmpeg','-nostdin','-v','error','-y',*map(str,args)],check=True)
ff('-framerate',30,'-i',out/'preview/%04d.png','-vf','scale=416:740','-c:v','libx264','-pix_fmt','yuv420p',out/'preview.mp4')
ff('-i',export,'-filter_complex','[0:v]split[a][b];[a]trim=start=0:end=4,setpts=PTS-STARTPTS[x];[b]trim=start=18:end=22,setpts=PTS-STARTPTS[y];[x][y]concat=n=2:v=1:a=0,fps=30,scale=416:740[v]','-map','[v]','-an','-c:v','libx264',out/'export.mp4')
ff('-i',out/'preview.mp4','-i',out/'export.mp4','-filter_complex','[0:v][1:v]hstack[v]','-map','[v]','-an','-c:v','libx264',out/'paired.mp4')
times=[.1,.267,.333,.533,.733,.967,1.067,1.267,1.667,3.067,4.067,5.1]
contact=Image.new('RGB',(832*3,770*4),'#151515');draw=ImageDraw.Draw(contact)
for i,t in enumerate(times):
 p=out/f'pair-{i:02}.png';ff('-ss',t,'-i',out/'paired.mp4','-frames:v',1,p)
 im=Image.open(p);x=i%3*832;y=i//3*770;contact.paste(im,(x,y+30));draw.text((x+8,y+6),f'Preview LEFT / Export RIGHT; source t={t if t<4 else t+14:.3f}s',fill='white')
contact.save(out/'contact.png')
(out/'paired-provenance.json').write_text(json.dumps({'export':str(export),'capture':str(out),'sourceWindowsSeconds':[[0,4],[18,22]],'fps':30,'frames':240,'audioCompared':False,'qualification':'Frame-stepped visual evidence only, not real-time playback, recognition, listening or automatic composition proof.'},indent=2))
print(out/'paired.mp4')
