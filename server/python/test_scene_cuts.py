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
        for args in [(12,3840,2160,30),(30.01,1280,720,24),(12,1280,720,120),(0,1280,720,24),(12,0,720,24),(12,1280,720,float('nan'))]:
            self.assertFalse(m.short_auto_cut_budget(*args))
    def test_refine_budget_is_bounded_without_full_decode(self):
        self.assertTrue(m.short_auto_refine_budget(35.729,1280,720,25,7))
        for args in [(61,1280,720,25,7),(35,3840,2160,25,7),(35,1280,720,120,7),(35,1280,720,25,31),(35,1280,720,25,0),(35,1280,720,float('nan'),7)]:
            self.assertFalse(m.short_auto_refine_budget(*args))
    def test_dense_is_bounded(self):
        self.assertEqual(m.discover_dense_scene_cuts('/not/a/file',0,181,24),[])
    def test_empty_does_not_invent_cuts(self):
        self.assertEqual(m.refine_scene_cuts('/not/a/file',[],0,.25,24),[])
    def test_unreadable_preserves_coarse_evidence(self):
        self.assertEqual(m.refine_scene_cuts('/not/a/file',[1.5],0,.25,24),[{'time':1.5,'coarse_time':1.5,'refined':False}])
if __name__ == '__main__': unittest.main()
