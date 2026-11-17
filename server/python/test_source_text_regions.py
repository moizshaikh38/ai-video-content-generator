import unittest
from source_text_regions import regions_from_tsv
HEADER='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'
def row(n,x,conf,text,line=1):return f'5\t1\t1\t1\t{line}\t{n}\t{x}\t50\t20\t15\t{conf}\t{text}\n'
class RegionsTest(unittest.TestCase):
 def test_keeps_low_confidence_ends_when_line_has_strong_multiword_evidence(self):
  t=HEADER+row(1,0,0,'edge')+row(2,30,90,'whole')+row(3,60,95,'sentence')+row(4,90,80,'here')+row(5,120,0,'end')
  r=regions_from_tsv(t,200,100);self.assertEqual(len(r),1);self.assertEqual(r[0]['x'],0);self.assertGreaterEqual(r[0]['width'],.74);self.assertNotIn('text',r[0])
 def test_sparse_or_low_confidence_not_semantic_evidence(self):
  self.assertEqual(regions_from_tsv(HEADER+row(1,10,99,'Logo'),200,100),[])
  self.assertEqual(regions_from_tsv(HEADER+row(1,10,1,'many')+row(2,40,2,'words')+row(3,70,3,'here'),200,100),[])
 def test_separate_lines_not_merged(self):
  t=HEADER+row(1,10,99,'first')+row(2,40,99,'second',2)+row(3,70,99,'third',3)
  self.assertEqual(regions_from_tsv(t,200,100),[])

class ShortLinesTest(unittest.TestCase):
 def test_two_strong_words_can_be_a_complete_line(self):
  r=regions_from_tsv(HEADER+row(1,10,95,'short')+row(2,40,94,'caption'),200,100)
  self.assertEqual(len(r),1)


class PersistenceTests(unittest.TestCase):
 def test_single_words_require_spatial_persistence_before_constraints(self):
  from source_text_regions import persistent_word_regions
  r=regions_from_tsv(HEADER+row(1,10,95,'ALPHA'),200,100,True)[0]
  self.assertEqual(r['kind'],'ocr-word-candidate')
  self.assertEqual(persistent_word_regions([{'time':0,'regions':[r]}]),[])
  samples=[{'time':t,'regions':[r]}for t in [0,.5,1]]
  self.assertEqual(len(persistent_word_regions(samples)),1)
 def test_duplicate_same_time_gap_and_moving_words_do_not_fake_persistence(self):
  from source_text_regions import persistent_word_regions
  r=regions_from_tsv(HEADER+row(1,10,95,'ALPHA'),200,100,True)[0]
  for rows in [[{'time':0,'regions':[r,r,r]}],[{'time':t,'regions':[r]}for t in [0,2,4]],[{'time':i*.5,'regions':[{**r,'x':i*.3}]}for i in range(3)]]:
   self.assertEqual(persistent_word_regions(rows),[])

if __name__=='__main__':unittest.main()
