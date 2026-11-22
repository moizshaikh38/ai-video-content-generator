import unittest
import tempfile
import os
import cv2
import numpy as np
from unittest.mock import patch
import measured_edge_aperture_review as review
from measured_edge_aperture_review import _edges,discover,run

class EdgeApertureReviewTests(unittest.TestCase):
    def image(self):
        return np.full((200,320,3),40,np.uint8)
    def rectangle(self,image,side):
        boxes=[(100,0,180,60),(100,139,180,199),(0,60,80,120),(239,60,319,120)]
        x,y,xx,yy=boxes[side]
        cv2.rectangle(image,(x,y),(xx,yy),(220,220,220),2)
        return x,y,xx,yy
    def video(self,image,faces,times=None):
        with tempfile.TemporaryDirectory() as temp:
            path=os.path.join(temp,'source.avi')
            writer=cv2.VideoWriter(path,cv2.VideoWriter_fourcc(*'MJPG'),2,(320,200))
            for _ in range(12):
                writer.write(image)
            writer.release()
            return run(path,{'raw_samples':[{'time':t,'faces':faces} for t in (times or [i*.5 for i in range(12)])]})
    def face(self):
        return {'x':.06,'y':.36,'width':.08,'height':.12,'confidence':.95,'track_id':'one'}
    def test_all_four_source_edges_are_discovered_without_color(self):
        for side in range(4):
            image=self.image();self.rectangle(image,side)
            boxes=discover(_edges(image))['boxes']
            self.assertTrue(any(b['implicit_source_edge']==side for b in boxes),side)
    def test_blank_open_and_interior_rectangles_do_not_invent_edge_aperture(self):
        for kind in ['blank','open','interior']:
            image=self.image()
            if kind=='open':
                cv2.line(image,(0,60),(80,60),(220,220,220),2)
                cv2.line(image,(80,60),(80,120),(220,220,220),2)
            if kind=='interior':
                cv2.rectangle(image,(40,60),(120,120),(220,220,220),2)
            self.assertEqual(discover(_edges(image))['boxes'],[],kind)
    def test_repeated_edge_candidate_needs_face_and_source_binding(self):
        image=self.image();self.rectangle(image,2)
        receipt=self.video(image,[self.face()])
        self.assertEqual(receipt['status'],'measured-rectangle')
        self.assertEqual(len(receipt['source_sha256']),64)
        self.assertTrue(receipt['local_review_only'])
        self.assertTrue(receipt['not_real_person_proof'])
        self.assertEqual(receipt['proposals'][0]['implicit_source_edge'],2)
        self.assertEqual(self.video(image,[])['status'],'unresolved')
    def test_weak_or_competing_faces_do_not_promote(self):
        image=self.image();self.rectangle(image,2)
        self.assertEqual(self.video(image,[{**self.face(),'confidence':.79}])['status'],'unresolved')
        self.assertEqual(self.video(image,[self.face(),{**self.face(),'track_id':'two'}])['status'],'unresolved')
    def test_out_of_scope_or_duplicate_face_clock_rejects(self):
        image=self.image();self.rectangle(image,2)
        for times in [[0,6],[0,0],[float('nan')]]:
            with self.assertRaises(ValueError):
                self.video(image,[self.face()],times)
    def test_high_resolution_budget_rejects_before_decode_and_releases(self):
        class Capture:
            released=False
            def get(self,key):
                return {cv2.CAP_PROP_FPS:30,cv2.CAP_PROP_FRAME_COUNT:180,
                        cv2.CAP_PROP_FRAME_WIDTH:1920,cv2.CAP_PROP_FRAME_HEIGHT:1080}[key]
            def read(self):
                raise AssertionError('budget must reject before decoding')
            def release(self):
                self.released=True
        capture=Capture()
        with patch.object(review.cv2,'VideoCapture',return_value=capture):
            with self.assertRaisesRegex(ValueError,'pixel budget'):
                run('unused',{'raw_samples':[]})
        self.assertTrue(capture.released)
    def test_line_and_candidate_budgets_reject_without_selecting_winner(self):
        image=self.image();self.rectangle(image,2)
        with patch.object(review,'discover',return_value={'status':'line-budget-rejected','boxes':[]}):
            with self.assertRaisesRegex(ValueError,'line budget'):
                self.video(image,[self.face()])
        boxes=[{'box':{'x':i*.01,'y':.3,'w':.1,'h':.3},'implicit_source_edge':2} for i in range(65)]
        with patch.object(review,'discover',return_value={'status':'observed-lines','boxes':boxes}):
            with self.assertRaisesRegex(ValueError,'candidate budget'):
                self.video(image,[self.face()])
    def test_two_independent_candidates_remain_ambiguous(self):
        image=self.image();self.rectangle(image,2);self.rectangle(image,3)
        receipt=self.video(image,[self.face(),{**self.face(),'x':.81,'track_id':'two'}])
        self.assertEqual(receipt['status'],'unresolved')
        self.assertGreaterEqual(len(receipt['proposals']),2)

if __name__=='__main__':
    unittest.main()
