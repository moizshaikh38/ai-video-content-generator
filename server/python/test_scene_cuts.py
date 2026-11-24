import importlib.util, os, tempfile, unittest
import cv2
import numpy as np
spec = importlib.util.spec_from_file_location('reframe', os.path.join(os.path.dirname(__file__), 'smart_reframe.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
class RefinementTests(unittest.TestCase):
    def test_frame_boundary_and_trim_relative_time(self):
        with tempfile.TemporaryDirectory() as d:
            path=os.path.join(d,'cuts.avi')
            writer=cv2.VideoWriter(path,cv2.VideoWriter_fourcc(*'MJPG'),24,(160,90))
            self.assertTrue(writer.isOpened())
            for i in range(72):
                frame=np.zeros((90,160,3),dtype=np.uint8)
                frame[:]=(0,0,255) if i<30 else (0,255,0)
                writer.write(frame)
            writer.release()
            for start,coarse,expected in [(0,1.5,1.25),(.5,1,.75)]:
                result=m.refine_scene_cuts(path,[coarse],start,.25,24)[0]
                self.assertAlmostEqual(result['time'],expected,places=5)
                self.assertEqual(result['coarse_time'],coarse)
                self.assertTrue(result['refined'])
                self.assertAlmostEqual(result['uncertainty_seconds'],1/24,places=5)
    def test_dense_discovers_rapid_cut_and_rebases_trim(self):
        with tempfile.TemporaryDirectory() as d:
            path=os.path.join(d,'dense.avi')
            writer=cv2.VideoWriter(path,cv2.VideoWriter_fourcc(*'MJPG'),24,(160,90))
            for i in range(72):
                frame=np.zeros((90,160,3),dtype=np.uint8)
                frame[:]=255 if i>=30 else 0
                writer.write(frame)
            writer.release()
            result=m.discover_dense_scene_cuts(path,.5,2,24)
            self.assertTrue(any(abs(e['time']-.75)<1/24 for e in result),result)
            self.assertTrue(all(e['method']=='dense-luma-discontinuity' for e in result))
    def test_short_auto_source_budget_rejects_4k_highfps_long_and_invalid(self):
        self.assertTrue(m.short_auto_cut_budget(30,1920,1080,60))
        self.assertTrue(m.short_auto_cut_budget(12,1280,720,24))
        self.assertTrue(m.short_auto_cut_budget(39.658,1280,720,25))
        self.assertTrue(m.short_auto_cut_budget(60,1920,1080,30))
        # Decode-work budget (frames x pixels <= 1800 frames of 1920x1080, duration <= 180s):
        # a 67s 59.94fps 640x360 source qualifies; the old 60s/1800-frame caps were a proxy.
        for args in [(66.963,640,360,59.94),(60.01,1280,720,24),(60,1280,720,60),(180,640,360,30)]:
            self.assertTrue(m.short_auto_cut_budget(*args))
        for args in [(12,3840,2160,30),(60.01,1920,1080,30),(30.01,1920,1080,60),(180.01,320,180,24),(12,1280,720,120),(0,1280,720,24),(12,0,720,24),(12,1280,720,float('nan'))]:
            self.assertFalse(m.short_auto_cut_budget(*args))
    def _avi(self,d,w,h,fps,n,cut):
        path=os.path.join(d,'s.avi')
        writer=cv2.VideoWriter(path,cv2.VideoWriter_fourcc(*'MJPG'),fps,(w,h))
        for i in range(n):
            frame=np.zeros((h,w,3),dtype=np.uint8)
            frame[:]=255 if i>=cut else 0
            writer.write(frame)
        writer.release()
        return path
    def test_analyzer_report_states_actual_pixel_frame_budget_and_status(self):
        with tempfile.TemporaryDirectory() as d:
            path=self._avi(d,160,90,24,72,30)
            r=m.analyze_video(path,4,0,3,20,True)
            cd=r['scene_cut_discovery']
            self.assertEqual(cd['status'],'completed')
            self.assertNotIn('frame_budget',cd)
            b=cd['budget']
            self.assertEqual(b['unit'],'frames*width*height')
            self.assertEqual(b['max_pixel_frames'],1800*1920*1080)
            self.assertEqual(b['max_duration_seconds'],180)
            self.assertAlmostEqual(b['pixel_frames'],3*24*160*90,delta=160*90*2)
            self.assertTrue(any(abs(c-1.25)<.1 for c in r['scene_cuts']),r['scene_cuts'])
            r2=m.analyze_video(path,4,0,3,20,False)
            self.assertEqual(r2['scene_cut_discovery']['status'],'not-requested')
    def test_analyzer_skipped_budget_report_is_truthful(self):
        with tempfile.TemporaryDirectory() as d:
            path=self._avi(d,1920,1080,24,6,3)
            orig=m.SHORT_AUTO_MAX_PIXEL_FRAMES
            try:
                m.SHORT_AUTO_MAX_PIXEL_FRAMES=1920*1080*2
                r=m.analyze_video(path,4,0,0.25,20,True)
            finally:
                m.SHORT_AUTO_MAX_PIXEL_FRAMES=orig
            cd=r['scene_cut_discovery']
            self.assertEqual(cd['status'],'skipped-budget')
            self.assertIn('frames*pixels',cd['reason'])
            self.assertEqual(cd['budget']['max_pixel_frames'],1920*1080*2)
    def test_refine_budget_is_bounded_without_full_decode(self):
        self.assertTrue(m.short_auto_refine_budget(35.729,1280,720,25,7))
        for args in [(61,1280,720,25,7),(35,3840,2160,25,7),(35,1280,720,120,7),(35,1280,720,25,31),(35,1280,720,25,0),(35,1280,720,float('nan'),7)]:
            self.assertFalse(m.short_auto_refine_budget(*args))
    def test_40s_auto_budget_discovers_tail_return_without_new_frame_budget(self):
        # Regression: a clip above the old 30s opt-in cap lost its final
        # gameplay-to-interview cut. A visual boundary is not subject identity.
        self.assertTrue(m.short_auto_cut_budget(40,160,90,25))
        with tempfile.TemporaryDirectory() as d:
            path=os.path.join(d,'tail.avi')
            writer=cv2.VideoWriter(path,cv2.VideoWriter_fourcc(*'MJPG'),25,(160,90))
            self.assertTrue(writer.isOpened())
            for i in range(1000):
                frame=np.zeros((90,160,3),dtype=np.uint8)
                frame[:]=255 if i>=891 else 0
                writer.write(frame)
            writer.release()
            result=m.discover_dense_scene_cuts(path,0,40,25)
            self.assertTrue(any(abs(e['time']-35.64)<1/25 for e in result),result)
            self.assertTrue(all(e['refined'] and e['uncertainty_seconds']<=.04 for e in result))

    def test_dense_is_bounded(self):
        self.assertEqual(m.discover_dense_scene_cuts('/not/a/file',0,181,24),[])
    def test_empty_does_not_invent_cuts(self):
        self.assertEqual(m.refine_scene_cuts('/not/a/file',[],0,.25,24),[])
    def test_unreadable_preserves_coarse_evidence(self):
        self.assertEqual(m.refine_scene_cuts('/not/a/file',[1.5],0,.25,24),[{'time':1.5,'coarse_time':1.5,'refined':False}])
if __name__ == '__main__': unittest.main()
