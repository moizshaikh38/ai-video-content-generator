"""Bounded local detector load/inference check. No video, downloads or network.

A blank image tests runtime compatibility, not detection accuracy or scene safety.
Optional models remain opt-in. Uses the analyzer's person wrapper and Haar loader.
"""
import json
import os


def probe():
    result = {'available': False, 'base': 'unavailable', 'face': {'kind': 'haar', 'status': 'unavailable'},
              'person': {'kind': 'nanodet', 'status': 'not-configured'},
              'scope': 'local-face-person-load-and-blank-inference-only'}
    try:
        import cv2
        import numpy as np
        cv2.setNumThreads(1)
        result['base'] = 'available'
        frame = np.zeros((320, 320, 3), dtype=np.uint8)
        from smart_reframe import load_cascades
        # The analyzer loads Haar even when YuNet is configured.
        frontal, profile = load_cascades()
        frontal.detectMultiScale(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
        model = os.environ.get('SMART_REFRAME_YUNET_MODEL', '')
        if model:
            result['face']['kind'] = 'yunet'
            detector = cv2.FaceDetectorYN_create(model, '', (320, 320),
                float(os.environ.get('SMART_REFRAME_YUNET_THRESHOLD', '0.6')), .3, 5000)
            detector.detect(frame)
        result['face']['status'] = 'available'
    except Exception:
        result['detail'] = 'Base OpenCV or configured face detector failed local load/inference.'
    model = os.environ.get('SMART_REFRAME_PERSON_MODEL', '')
    if model:
        result['person']['status'] = 'unavailable'
        try:
            from person_regions import PersonRegions
            detector = PersonRegions(model)
            detector.infer(frame)
            result['person']['status'] = 'available'
        except Exception:
            result['detail'] = 'Configured person detector failed checksum/load/inference or base runtime is unavailable.'
    result['available'] = result['base'] == 'available' and result['face']['status'] == 'available' and result['person']['status'] != 'unavailable'
    return result


if __name__ == '__main__':
    print(json.dumps(probe()))
