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
    def test_empty_does_not_invent_cuts(self):
        self.assertEqual(m.refine_scene_cuts('/not/a/file',[],0,.25,24),[])
    def test_unreadable_preserves_coarse_evidence(self):
        self.assertEqual(m.refine_scene_cuts('/not/a/file',[1.5],0,.25,24),[{'time':1.5,'coarse_time':1.5,'refined':False}])
if __name__ == '__main__': unittest.main()
