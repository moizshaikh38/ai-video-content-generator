"""Stub-only adapter. Deliberately no real renderer/HTTP/database worker route."""
import json
import os
from pathlib import Path
import sys
import time

from export_contract import canonical, validate_manifest
from export_observer import observe

STUBS = ('success', 'encoder-failure', 'malformed-diagnostics', 'timeout', 'manifest-mismatch')


def launch_stub(manifest, destination, stub='success', **observer_limits):
    if stub not in STUBS:
        raise ValueError('Only enumerated non-media workers are supported.')
    validated, digest = validate_manifest(manifest)
    destination = Path(destination).resolve()
    destination.mkdir(parents=True, exist_ok=False, mode=0o700)
    manifest_path = destination / 'manifest.json'
    with manifest_path.open('xb') as stream:
        stream.write(canonical(validated))
    manifest_path.chmod(0o400)
    # No arbitrary executable, shell or production imports. Worker validates
    # the manifest a second time against the expected hash before stub work.
    receipt = observe([sys.executable, str(Path(__file__).resolve()), '--stub-worker',
                       str(manifest_path), digest, stub], destination / 'observation',
                      manifest_sha256=digest, **observer_limits)
    outcome = {'worker_kind': 'non-media-stub', 'actual_export_verified': False,
               'manifest_sha256': digest, 'observation': receipt}
    (destination / 'stub-result.json').write_bytes(canonical(outcome))
    return outcome


def stub_worker(manifest_path, expected, stub):
    if stub not in STUBS:
        return 2
    path = Path(manifest_path)
    if path.stat().st_size > 8192:
        return 2
    _, digest = validate_manifest(json.loads(path.read_bytes()))
    if digest != expected or stub == 'manifest-mismatch':
        return 2
    work = Path(os.environ['VIREO_QUALIFICATION_WORKDIR']).resolve()
    if work != Path.cwd().resolve():
        return 2
    events = []
    def emit(stage, code='NONE'):
        events.append({'sequence': len(events), 'stage': stage, 'code': code, 'manifest_sha256': digest})
        temp = work / 'diagnostics.tmp'
        with temp.open('wb') as stream:
            stream.write(canonical(events))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, work / 'diagnostics.json')
    emit('preflight')
    if stub == 'timeout':
        time.sleep(20)
        return 3
    emit('prepare')
    emit('encode')
    if stub == 'encoder-failure':
        emit('failed', 'ENCODER_EXIT')
        return 7
    if stub == 'malformed-diagnostics':
        (work / 'diagnostics.json').write_text('{"private":"DO_NOT_RETAIN"}')
        return 9
    emit('validate')
    emit('complete')
    return 0


if __name__ == '__main__':
    # Fixed stub protocol, no generic command line passthrough.
    if len(sys.argv) != 5 or sys.argv[1] != '--stub-worker':
        raise SystemExit(2)
    try:
        result = stub_worker(sys.argv[2], sys.argv[3], sys.argv[4])
    except (ValueError, OSError, KeyError, TypeError):
        result = 2
    raise SystemExit(result)
