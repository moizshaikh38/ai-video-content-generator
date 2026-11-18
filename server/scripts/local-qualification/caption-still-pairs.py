"""Pair sparse actual PreviewCanvas captures with decoded export frames.
Evidence only: no typography/motion/parity verdict. EXPORT CAPTURE_DIR arguments.
"""
import json,pathlib,subprocess,sys
from PIL import Image,ImageDraw
export=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2])
r=json.loads((out/'preview-states.json').read_text());rows=r['states']
if not rows or len(rows)>12:raise ValueError('Use sparse 1-12 frame capture')
if (out/'pairs.png').exists():raise ValueError('Refuse to overwrite paired evidence')
if any(abs(s['t']-s['videoTime'])>.002 for s in rows):raise ValueError('Decoded timestamp mismatch')
canvas=Image.new('RGB',(480*len(rows),490),'#171717');draw=ImageDraw.Draw(canvas)
for i,s in enumerate(rows):
 target=out/f'export-{i}.png';subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-ss',str(s['t']),'-i',str(export),'-frames:v','1',str(target)],check=True)
 for j,src in enumerate([out/'preview'/f'{i:04}.png',target]):
  im=Image.open(src).convert('RGB');im.thumbnail((240,450));x=(i*2+j)*240;canvas.paste(im,(x,30));draw.text((x+3,8),f"{s['t']}s "+('preview' if j==0 else 'export'),fill='white')
canvas.save(out/'pairs.png')
fonts=sorted({f['postScriptName'] for row in r['platformFonts'] for f in row['fonts']})
(out/'pairs-provenance.json').write_text(json.dumps({'export':str(export),'capture':str(out),'times':[s['t'] for s in rows],'platformFonts':fonts,'audioCompared':False,'qualification':'Sparse decoded stills, not motion/accuracy/parity approval.'},indent=2)+'\n')
print(out/'pairs.png',fonts)
