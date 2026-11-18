"""Non-media tests. Only stdlib imports and Python sleep/write/allocation stubs.
No test discovery outside this file, application imports, providers or encoders.
"""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('export_observer', Path(__file__).with_name('export_observer.py'))
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)


class ExportObserverTests(unittest.TestCase):
    def run_stub(self, code, **kwargs):
        with tempfile.TemporaryDirectory(prefix='export-observer-test-') as parent:
            evidence = Path(parent) / 'evidence'
            result = observer.observe([sys.executable, '-c', code], evidence, **kwargs)
            stored = json.loads((evidence / 'receipt.json').read_text())
            self.assertEqual(stored, result)
            self.assertEqual(result['state'], 'finished')
            self.assertFalse((evidence / 'owned-work').exists())
            self.assertFalse((evidence / 'receipt.tmp').exists())
            self.assertFalse(result.get('remaining_session_pids'))
            return result, json.dumps(stored)

    def test_natural_exit_and_private_output_suppressed(self):
        result, receipt = self.run_stub("import sys; print('PRIVATE_SECRET_ABC'); print('private-caption',file=sys.stderr)")
        self.assertEqual(result['worker_returncode'], 0)
        self.assertEqual(result['stop_reason'], 'worker-exit')
        self.assertGreater(result['stdout_bytes'], 0)
        self.assertGreater(result['stderr_bytes'], 0)
        self.assertNotIn('PRIVATE_SECRET_ABC', receipt)
        self.assertNotIn('private-caption', receipt)

    def test_nonzero_exit(self):
        result, _ = self.run_stub('raise SystemExit(17)')
        self.assertEqual(result['worker_returncode'], 17)
        self.assertEqual(result['stop_reason'], 'worker-exit')

    def test_timeout_kills_owned_descendant(self):
        code = "import subprocess,sys,time; subprocess.Popen([sys.executable,'-c','import time;time.sleep(20)']); time.sleep(20)"
        result, _ = self.run_stub(code, timeout_seconds=.2)
        self.assertEqual(result['stop_reason'], 'wall-clock-safety-stop')
        self.assertEqual(result['worker_signal'], 9)

    def test_worker_exit_with_descendant_is_not_success(self):
        code = "import subprocess,sys; subprocess.Popen([sys.executable,'-c','import time;time.sleep(20)'])"
        result, _ = self.run_stub(code)
        self.assertEqual(result['stop_reason'], 'worker-exit-with-descendants')

    def test_descendant_new_group_same_session(self):
        code = "import subprocess,sys,time,os; subprocess.Popen([sys.executable,'-c','import os,time;os.setpgrp();time.sleep(20)']); time.sleep(20)"
        result, _ = self.run_stub(code, timeout_seconds=.2)
        self.assertEqual(result['stop_reason'], 'wall-clock-safety-stop')

    def test_supervisor_sigterm_finalizes_and_cleans(self):
        code = "import os,signal,time;os.kill(os.getppid(),signal.SIGTERM);time.sleep(20)"
        result, _ = self.run_stub(code)
        self.assertEqual(result['stop_reason'], 'observer-interrupted')
        self.assertEqual(result['observer_signal'], 15)

    def test_memory_stop(self):
        result, _ = self.run_stub('import time; a=bytearray(32*1024*1024); time.sleep(20)', max_rss_bytes=16*1024*1024)
        self.assertEqual(result['stop_reason'], 'sampled-memory-safety-stop')

    def test_owned_work_disk_stop(self):
        result, _ = self.run_stub("import pathlib,time; pathlib.Path('output').write_bytes(b'x'*65536); time.sleep(20)", max_work_bytes=1024)
        self.assertEqual(result['stop_reason'], 'owned-work-disk-limit')
        self.assertEqual(result['peak_work_bytes'], 65536)

    def test_disk_reserve_prevents_spawn(self):
        result, _ = self.run_stub("raise RuntimeError('must not run')", reserve_free_bytes=10**30)
        self.assertEqual(result['stop_reason'], 'disk-reserve-preflight')
        self.assertNotIn('worker_pid', result)

    def test_cancel(self):
        result, _ = self.run_stub('import time;time.sleep(20)', cancel=lambda: True)
        self.assertEqual(result['stop_reason'], 'cancelled')

    def test_large_logs_drained_without_buffer_limit_or_retention(self):
        result, _ = self.run_stub("import sys;sys.stdout.write('x'*2000000);sys.stderr.write('y'*2000000)")
        self.assertEqual(result['worker_returncode'], 0)
        self.assertEqual(result['stdout_bytes'], 2000000)
        self.assertEqual(result['stderr_bytes'], 2000000)

    def test_spawn_failure_still_finalizes(self):
        with tempfile.TemporaryDirectory() as parent:
            result = observer.observe(['/not/a/qualification-executable'], Path(parent) / 'evidence')
            self.assertEqual(result['stop_reason'], 'observer-error')
            self.assertEqual(result['observer_error_type'], 'FileNotFoundError')
            self.assertEqual(result['state'], 'finished')

    def test_evidence_collision_and_limits_refused(self):
        with tempfile.TemporaryDirectory() as parent:
            with self.assertRaises(FileExistsError):
                observer.observe([sys.executable, '-c', 'pass'], parent)
            with self.assertRaises(ValueError):
                observer.observe([sys.executable, '-c', 'pass'], Path(parent) / 'not-created', timeout_seconds=999)
            self.assertFalse((Path(parent) / 'not-created').exists())


if __name__ == '__main__':
    unittest.main()
