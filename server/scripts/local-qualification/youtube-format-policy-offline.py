"""Offline format selection only. No URL extraction, network, media, encoder or installation.
Uses the existing yt_dlp Python library and synthetic non-resolving format URLs.
"""
import copy,json,pathlib,re,socket,subprocess,unittest
import yt_dlp
ROOT=pathlib.Path(__file__).resolve().parents[2]
source=(ROOT/'src/utils/youtubeFormatPolicy.ts').read_text()
FORMAT=re.search(r"YOUTUBE_SOURCE_FORMAT='([^']+)'",source).group(1)
SORT=re.search(r"YOUTUBE_SOURCE_FORMAT_SORT='([^']+)'",source).group(1).split(',')
def forbidden(*args,**kwargs):raise AssertionError('Offline selection may not start network or subprocess work')
socket.create_connection=forbidden
subprocess.Popen=forbidden

def video(name,height,codec='avc1.640028',fps=30,ext='mp4'):
 return dict(format_id=name,url='https://offline.invalid/'+name,ext=ext,vcodec=codec,acodec='none',width=height*16//9,height=height,fps=fps,tbr=1000)
def audio():return dict(format_id='audio',url='https://offline.invalid/audio',ext='m4a',vcodec='none',acodec='mp4a.40.2',abr=128)
def pick(formats,spec=FORMAT,sort=SORT):
 with yt_dlp.YoutubeDL({'quiet':True,'no_warnings':True,'cachedir':False,'format':spec,'format_sort':sort})as y:
  y.urlopen=forbidden
  info={'formats':copy.deepcopy(formats)};y.sort_formats(info)
  return [dict(format_id=f['format_id'],height=f.get('height'))for f in y.build_format_selector(spec)({'formats':info['formats'],'has_merged_format':False,'incomplete_formats':False})]
class Selection(unittest.TestCase):
 def test_regression_old_policy_selected_360_instead_of_1080(self):
  f=[video('h264',360),video('vp9',1080,'vp9',ext='webm'),audio()]
  old='bestvideo[vcodec^=avc1][height<=1080]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/bestvideo+bestaudio/best'
  self.assertEqual(pick(f,old,[])[0]['height'],360)
  self.assertEqual(pick(f)[0],{'format_id':'vp9+audio','height':1080})
 def test_equal_resolution_and_fps_prefers_h264(self):self.assertEqual(pick([video('h264',1080),video('vp9',1080,'vp9',ext='webm'),audio()])[0]['format_id'],'h264+audio')
 def test_at_equal_resolution_frame_rate_wins(self):self.assertEqual(pick([video('h264',1080),video('vp9',1080,'vp9',60,'webm'),audio()])[0]['format_id'],'vp9+audio')
 def test_1440_does_not_bypass_ceiling(self):self.assertEqual(pick([video('h264',720),video('vp9',1440,'vp9',ext='webm'),audio()])[0]['height'],720)
 def test_only_4k_is_not_silently_acquired(self):self.assertEqual(pick([video('4k',2160),audio()]),[])
 def test_low_resolution_remains_available(self):self.assertEqual(pick([video('h264',360),audio()])[0]['height'],360)
 def test_completed_muxed_fallback(self):
  f=video('muxed',480);f['acodec']='mp4a.40.2';self.assertEqual(pick([f])[0]['format_id'],'muxed')
 def test_audio_only_is_not_video(self):self.assertEqual(pick([audio()]),[])
if __name__=='__main__':unittest.main()
