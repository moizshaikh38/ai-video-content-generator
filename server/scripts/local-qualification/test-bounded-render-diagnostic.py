"""Lightweight diagnostic-runner guard tests. Never launches ffmpeg or a render."""
import importlib.util, json, os, pathlib, subprocess, sys, tempfile, unittest
SCRIPT = pathlib.Path(__file__).with_name('bounded-render-diagnostic.py')
spec = importlib.util.spec_from_file_location('diagnostic', SCRIPT)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class DiagnosticGuardTests(unittest.TestCase):
    def check_rejected(self, flags, env_gate=False, argv=None):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder); command = root/'argv.json'; output=root/'result'
            command.write_text(json.dumps(argv or ['/usr/bin/ffmpeg','-nostdin','-version']))
            env = dict(os.environ); env.pop('VIREO_ALLOW_BOUNDED_DIAGNOSTIC',None)
            if env_gate: env['VIREO_ALLOW_BOUNDED_DIAGNOSTIC']='1'
            result = subprocess.run([sys.executable,str(SCRIPT),'--argv-json',str(command),'--output-dir',str(output),*flags],env=env,capture_output=True,text=True,timeout=3)
            self.assertEqual(result.returncode,2,result.stdout+result.stderr)
            self.assertFalse(output.exists(),'Rejected invocation must not create output or launch a child')
            return result.stderr

    def test_no_run_flag_rejected_even_with_environment_gate(self):
        self.assertIn('execution held',self.check_rejected([],True))
    def test_environment_gate_required_even_with_run_flag(self):
        self.assertIn('execution held',self.check_rejected(['--run']))
    def test_large_memory_budget_rejected(self):
        self.assertIn('64–512MiB',self.check_rejected(['--run','--rss-limit-mib','513'],True))
    def test_long_timeout_rejected(self):
        self.assertIn('1–30seconds',self.check_rejected(['--run','--seconds','31'],True))
    def test_wrong_executable_rejected(self):
        self.assertIn('Only an existing ffmpeg',self.check_rejected(['--run'],True,['/bin/echo','-nostdin']))
    def test_interactive_ffmpeg_rejected(self):
        self.assertIn('Only an existing ffmpeg',self.check_rejected(['--run'],True,['/usr/bin/ffmpeg','-version']))
    def test_malformed_argv_rejected(self):
        self.assertIn('argv must',self.check_rejected(['--run'],True,{'command':'ffmpeg'}))
    def test_nonexistent_group_sample_is_empty(self):
        self.assertEqual(module.group_sample(2147483647),[])
    def test_cgroup_probe_returns_a_snapshot_or_explicit_unavailable(self):
        result=module.cgroup_snapshot()
        self.assertTrue('path' in result or 'unavailable' in result)

if __name__=='__main__': unittest.main()
