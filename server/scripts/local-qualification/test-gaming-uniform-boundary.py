import pathlib, importlib.util, unittest
p=pathlib.Path(__file__).with_name('gaming-uniform-boundary.py')
s=importlib.util.spec_from_file_location('uniform',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class UniformContexts(unittest.TestCase):
 def test_uniform_windows(self):
  rows=[{'time':n/2,'faces':[{}]} for n in range(120)]
  windows=m.context_samples(rows,60)
  self.assertEqual([s for s,_ in windows],[3,28,53]);self.assertEqual([len(r) for _,r in windows],[8,8,8])
 def test_short_missing_and_multiple_rejected(self):
  with self.assertRaises(ValueError):m.context_samples([],4)
  with self.assertRaises(ValueError):m.context_samples([],60)
  rows=[{'time':n/2,'faces':[{},{}]} for n in range(120)]
  with self.assertRaises(ValueError):m.context_samples(rows,60)
if __name__=='__main__':unittest.main()
