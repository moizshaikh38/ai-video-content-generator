import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).parent/'gaming_scene'))
from decoded_clock import decoded_frames,coverage

class DecodedClockTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(dir='/dev/shm')
        cls.path=Path(cls.temp.name)/'zero.mp4'
        subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=64x48:rate=30','-t','1','-c:v','libx264','-bf','2','-y',str(cls.path)],check=True)
    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()
    def test_zero_and_fractional_trim_preserve_original_pts(self):
        for start,end,count in [(0.,1.,30),(.15,.85,21)]:
            rows=list(decoded_frames(str(self.path),start,end,64,48))
            times=[t for t,f in rows]
            self.assertEqual(len(rows),count)
            self.assertTrue(all(f.shape==(48,64,3) for t,f in rows))
            self.assertTrue(coverage(times,start,end,30)['clockCoverageVerified'])
            if start:self.assertAlmostEqual(times[0],1/6)
        # Independent ffprobe oracle in a test only, never paired to product pixels.
        oracle=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(self.path)]))
        want=[float(r['best_effort_timestamp_time']) for r in oracle['frames']]
        self.assertEqual(len(want),30)
        for (t,_),expected in zip(decoded_frames(str(self.path),0,1,64,48),want):self.assertAlmostEqual(t,expected,places=6)
    def test_nonzero_start_not_retimed_or_repaired(self):
        path=Path(self.temp.name)/'offset.mp4'
        subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(self.path),'-c','copy','-output_ts_offset','0.2','-y',str(path)],check=True)
        before=hashlib.sha256(path.read_bytes()).hexdigest()
        times=[t for t,_ in decoded_frames(str(path),0,1,64,48)]
        self.assertAlmostEqual(times[0],.2)
        self.assertFalse(coverage(times,0,1,30)['clockCoverageVerified'])
        self.assertAlmostEqual(coverage(times,0,1,30)['leadingUncoveredSeconds'],.2)
        self.assertEqual(before,hashlib.sha256(path.read_bytes()).hexdigest())
    def test_nonzero_absolute_interval_uses_source_not_relative_seek(self):
        path=Path(self.temp.name)/'offset10.mp4'
        subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(self.path),'-c','copy','-output_ts_offset','10','-y',str(path)],check=True)
        times=[t for t,_ in decoded_frames(str(path),10.15,10.85,64,48)]
        self.assertEqual(len(times),21)
        self.assertAlmostEqual(times[0],10+1/6)
        self.assertTrue(coverage(times,10.15,10.85,30)['clockCoverageVerified'])
    def test_vfr_gap_fails_coverage(self):
        path=Path(self.temp.name)/'vfr.mkv'
        subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(self.path),'-vf',"select='not(between(n,10,15))'",'-vsync','0','-c:v','ffv1','-y',str(path)],check=True)
        times=[t for t,_ in decoded_frames(str(path),0,1,64,48)]
        self.assertEqual(len(times),24)
        self.assertFalse(coverage(times,0,1,30)['clockCoverageVerified'])
    def test_empty_duplicate_unordered_and_nonfinite_fail_closed(self):
        for times in [[],[0,0],[.1,.05],[float('nan')],[0,1.1]]:
            self.assertFalse(coverage(times,0,1,30)['clockCoverageVerified'])
    def test_invalid_request_and_decoder_failure(self):
        for start,end in [(-1,1),(1,1),(0,31)]:
            with self.assertRaises(ValueError):list(decoded_frames(str(self.path),start,end,64,48))
        with self.assertRaises(ValueError):list(decoded_frames('/nonexistent/media',0,1,64,48))
    def test_unexpected_pixel_dimensions_fail_closed(self):
        with self.assertRaises(ValueError):list(decoded_frames(str(self.path),0,1,32,48))
    def test_consumer_close_reaps_decoder(self):
        iterator=decoded_frames(str(self.path),0,1,64,48)
        next(iterator);iterator.close()

if __name__=='__main__':unittest.main()
