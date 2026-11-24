"""Report what this analyzer actually ran, never scene meaning or absence."""
def measured_capabilities(yunet_enabled, person_enabled, samples):
    return {
        'version': 1,
        'face_detector': 'opencv-yunet' if yunet_enabled else 'opencv-haar',
        'person_detector': 'opencv-nanodet' if person_enabled else 'not-configured',
        'sample_count': len(samples),
        'face_sample_count': sum(bool(s.get('faces')) for s in samples),
        'person_sample_count': sum(bool(s.get('persons')) for s in samples) if person_enabled else 0,
        'human_animation_classification': 'not-run',
        'active_speaker_verification': 'not-run',
        'absence_means': 'not-observed-not-absent',
    }
