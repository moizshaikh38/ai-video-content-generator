"""Local probe tests. Real model quality is not established by blank inference."""
import os
import tempfile
import unittest
from unittest.mock import patch
from reframe_runtime_probe import probe


class RuntimeProbeTests(unittest.TestCase):
    def clean(self, values=None):
        env = dict(os.environ)
        for key in ['SMART_REFRAME_YUNET_MODEL', 'SMART_REFRAME_PERSON_MODEL', 'SMART_REFRAME_YUNET_THRESHOLD']:
            env.pop(key, None)
        env.update(values or {})
        return patch.dict(os.environ, env, clear=True)

    def test_optional_unset_is_not_body_capability(self):
        with self.clean():
            result = probe()
        self.assertTrue(result['available'])
        self.assertEqual(result['face'], {'kind': 'haar', 'status': 'available'})
        self.assertEqual(result['person']['status'], 'not-configured')

    def test_explicit_missing_person_fails(self):
        with self.clean({'SMART_REFRAME_PERSON_MODEL': '/not-found/person.onnx'}):
            result = probe()
        self.assertFalse(result['available'])
        self.assertEqual(result['person']['status'], 'unavailable')
        self.assertNotIn('/not-found', str(result))

    def test_corrupt_person_checksum_fails(self):
        with tempfile.NamedTemporaryFile() as f:
            f.write(b'not-model');f.flush()
            with self.clean({'SMART_REFRAME_PERSON_MODEL': f.name}):
                result = probe()
        self.assertFalse(result['available'])
        self.assertEqual(result['person']['status'], 'unavailable')

    def test_explicit_missing_face_fails_without_haar_fallback(self):
        with self.clean({'SMART_REFRAME_YUNET_MODEL': '/not-found/face.onnx'}):
            result = probe()
        self.assertFalse(result['available'])
        self.assertEqual(result['face'], {'kind': 'yunet', 'status': 'unavailable'})
        self.assertNotIn('/not-found', str(result))

    def test_unsupported_dnn_backend_is_unavailable(self):
        with self.clean({'SMART_REFRAME_YUNET_MODEL': 'configured.onnx'}), patch('cv2.FaceDetectorYN_create', side_effect=RuntimeError('unsupported backend')):
            result = probe()
        self.assertFalse(result['available'])
        self.assertEqual(result['face']['status'], 'unavailable')

    def test_base_import_failure_is_unavailable_not_optional_success(self):
        with self.clean(), patch.dict('sys.modules', {'cv2': None}):
            result = probe()
        self.assertFalse(result['available'])
        self.assertEqual(result['base'], 'unavailable')


if __name__ == '__main__':
    unittest.main()
