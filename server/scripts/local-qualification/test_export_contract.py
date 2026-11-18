"""Direct, non-media tests. Only stdlib and inert qualification modules.
Only launched worker: Python export_stub_adapter.py's enumerated stub route.
"""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from export_contract import validate_manifest, validate_events, read_events
from export_stub_adapter import launch_stub, stub_worker


def fixture():
    return {'version': 1, 'kind': 'ordinary-single-slice', 'revision': 'a'*40,
            'source_sha256': 'b'*64, 'graph_sha256': 'c'*64,
            'clip_id': '11111111-1111-4111-8111-111111111111',
            'editor_id': '22222222-2222-4222-8222-222222222222',
            'job_id': '33333333-3333-4333-8333-333333333333', 'editor_version': 2,
            'base': {'start': 10, 'end': 40, 'duration': 30},
            'trim': {'start': 2, 'end': 5}, 'source': {'duration': 90},
            'slice': {'source_start': 12, 'source_end': 35, 'speed': 1,
                      'canvas_duration': 23, 'output_duration': 23},
            'resolution': {'tier': '2160p', 'width': 2160, 'height': 3840}}


class ContractTests(unittest.TestCase):
    def test_validated_copy_and_hash_binding(self):
        raw = fixture()
        validated, digest = validate_manifest(raw)
        raw['base']['duration'] = 999
        self.assertEqual(validated['base']['duration'], 30)
        _, second = validate_manifest({**validated, 'editor_version': 3})
        self.assertNotEqual(digest, second)

    def test_speed_clock_not_base_clock(self):
        for speed in (2, 4):
            raw = fixture()
            raw['slice'].update(speed=speed, canvas_duration=23/speed, output_duration=23/speed)
            validate_manifest(raw)
        slow = fixture()
        slow['base'] = {'start': 10, 'end': 22, 'duration': 12}
        slow['trim'] = {'start': 0, 'end': 0}
        slow['slice'] = {'source_start': 10, 'source_end': 22, 'speed': .5, 'canvas_duration': 24, 'output_duration': 24}
        validate_manifest(slow)

    def test_tail_extension_bounded_by_source(self):
        raw = fixture()
        raw['trim'] = {'start': 2, 'end': -2}
        raw['slice'].update(source_end=42, canvas_duration=30, output_duration=30)
        validate_manifest(raw)
        raw['source']['duration'] = 41
        with self.assertRaises(ValueError):
            validate_manifest(raw)

    def test_malformed_legacy_unsupported_and_private_fields_refused(self):
        mutations = [lambda m: m['base'].update(duration=999), lambda m: m['base'].update(duration=None),
                     lambda m: m['base'].update(duration='30'), lambda m: m['base'].update(start=True),
                     lambda m: m['slice'].update(speed=float('nan')), lambda m: m['slice'].update(speed=0),
                     lambda m: m['slice'].update(canvas_duration=30), lambda m: m.update(source_url='private'),
                     lambda m: m['slice'].update(captions='private'), lambda m: m.update(kind='multi-slice'),
                     lambda m: m['resolution'].update(width=1080), lambda m: m.update(editor_version=True)]
        for mutate in mutations:
            raw = fixture(); mutate(raw)
            with self.assertRaises(ValueError):
                validate_manifest(raw)

    def test_diagnostic_schema_binding_order_and_no_raw_content(self):
        digest = 'a'*64
        event = {'sequence': 0, 'stage': 'preflight', 'code': 'NONE', 'manifest_sha256': digest}
        validate_events([event], digest)
        for replacement in [{'extra': 'private'}, {'stage': 'arbitrary-private'}, {'code': 'PRIVATE'},
                            {'sequence': True}, {'manifest_sha256': 'b'*64}]:
            with self.assertRaises(ValueError):
                validate_events([{**event, **replacement}], digest)
        with self.assertRaises(ValueError):
            validate_events([event, {**event, 'sequence': 1}], digest)
        with self.assertRaises(ValueError):
            validate_events([{**event, 'stage': 'complete'}], digest)
        with self.assertRaises(ValueError):
            validate_events([{**event, 'stage': 'failed'}], digest)

    def test_worker_rechecks_changed_manifest(self):
        raw = fixture()
        _, digest = validate_manifest(raw)
        raw['editor_version'] = 3
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'manifest.json'
            path.write_text(json.dumps(raw))
            self.assertEqual(stub_worker(path, digest, 'success'), 2)

    def test_diagnostic_artifact_refuses_symlink_oversize_and_private_content(self):
        with tempfile.TemporaryDirectory() as root:
            work = Path(root) / 'work'; work.mkdir()
            target = work / 'diagnostics.json'
            outside = Path(root) / 'outside'; outside.write_text('private')
            target.symlink_to(outside)
            self.assertEqual(read_events(work, 'a'*64), {'status': 'rejected'})
            target.unlink(); target.write_text('x'*9000)
            self.assertEqual(read_events(work, 'a'*64), {'status': 'rejected'})
            target.write_text('{"raw":"private"}')
            result = read_events(work, 'a'*64)
            self.assertEqual(result, {'status': 'rejected'})
            self.assertNotIn('private', json.dumps(result))

    def test_observed_stub_protocol(self):
        for stub, expected in [('success', 'validated'), ('encoder-failure', 'validated'),
                               ('malformed-diagnostics', 'rejected'), ('manifest-mismatch', 'missing'),
                               ('timeout', 'validated')]:
            with tempfile.TemporaryDirectory() as root:
                dest = Path(root) / 'run'
                result = launch_stub(fixture(), dest, stub, timeout_seconds=.4)
                self.assertEqual(result['worker_kind'], 'non-media-stub')
                self.assertFalse(result['actual_export_verified'])
                receipt = result['observation']
                self.assertEqual(receipt['worker_diagnostics']['status'], expected)
                self.assertFalse(receipt['remaining_session_pids'])
                self.assertFalse((dest / 'observation' / 'owned-work').exists())
                self.assertEqual(json.loads((dest / 'stub-result.json').read_bytes()), result)
                self.assertNotIn('DO_NOT_RETAIN', json.dumps(result))
                if stub == 'success':
                    self.assertEqual(receipt['worker_returncode'], 0)
                    self.assertTrue(receipt['worker_diagnostics']['terminal'])
                    self.assertEqual(receipt['worker_diagnostics']['events'][-1]['stage'], 'complete')
                elif stub == 'encoder-failure':
                    self.assertEqual(receipt['worker_returncode'], 7)
                    self.assertEqual(receipt['worker_diagnostics']['events'][-1]['code'], 'ENCODER_EXIT')
                elif stub == 'timeout':
                    self.assertEqual(receipt['stop_reason'], 'wall-clock-safety-stop')
                    self.assertFalse(receipt['worker_diagnostics']['terminal'])

    def test_invalid_manifest_and_worker_refused_before_launch(self):
        with tempfile.TemporaryDirectory() as root:
            dest = Path(root) / 'run'
            for stub in ('ffmpeg', '/bin/sh'):
                with self.assertRaises(ValueError):
                    launch_stub(fixture(), dest, stub)
            bad = fixture(); bad['base']['duration'] = 99
            with self.assertRaises(ValueError):
                launch_stub(bad, dest)
            self.assertFalse(dest.exists())


if __name__ == '__main__':
    unittest.main()
