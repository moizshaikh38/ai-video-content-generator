"""Report-only failed verifier diagnostic. Does not set face eligibility."""
import json,math
def diagnostic(e):
 p=e.get('landmarks');b=e['raw_box']
 if not p or len(p)!=5:return 'unknown',['missing-landmarks']
 a,z,n,r,l=[(q['x'],q['y'])for q in p];dx=z[0]-a[0];dy=z[1]-a[1];dist=math.hypot(dx,dy)
 if dist<=1e-9:return 'unknown',['degenerate-eye-baseline']
 ux,uy=-dy/dist,dx/dist
 if uy<0:ux,uy=-ux,-uy
 mid=((a[0]+z[0])/2,(a[1]+z[1])/2);mouth=((r[0]+l[0])/2,(r[1]+l[1])/2)
 proj=lambda q:(q[0]-mid[0])*ux+(q[1]-mid[1])*uy
 reasons=[]
 if not(proj(n)>0 and proj(mouth)>proj(n)):reasons.append('face-ordering')
 if not all(b[0]<=q[0]<=b[0]+b[2]and b[1]<=q[1]<=b[1]+b[3]for q in [a,z,n,r,l]):reasons.append('landmark-outside-raw-box')
 return ('suspicious'if reasons else'plausible-topology'),reasons

if __name__=='__main__':
 import argparse,collections
 p=argparse.ArgumentParser();p.add_argument('fixture');args=p.parse_args()
 rows=json.load(open(args.fixture))['rows'];counts=collections.defaultdict(collections.Counter)
 for row in rows:
  state,reasons=diagnostic(row['face_evidence']);assert state==row['diagnostic'] and reasons==row['reasons'];counts[row['split']+' / '+row['label']['label']][state]+=1
 print(json.dumps({k:dict(v)for k,v in counts.items()},indent=2))
