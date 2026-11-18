"""Qualification-only contract, inert imports, no application/media dependencies.

This validates a proposed ordinary single-slice clock manifest. Hashes and IDs
are bindings supplied by the caller, not independently verified source facts.
The companion launcher only accepts non-media stubs, never an export worker.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import uuid

HEX64 = re.compile(r'^[0-9a-f]{64}$')
REVISION = re.compile(r'^[0-9a-f]{40}$')
STAGES = ('preflight', 'prepare', 'encode', 'validate', 'complete', 'failed')
CODES = ('NONE', 'FIXTURE_REJECTED', 'RESOURCE_STOP', 'ENCODER_EXIT', 'OUTPUT_REJECTED', 'INTERNAL_ERROR')


def exact_keys(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys.split()):
        raise ValueError('Unexpected contract fields.')


def number(value, low, high):
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError('Invalid contract number.')
    return value


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def validate_manifest(raw):
    # Detached copy prevents a caller mutation changing a validated decision.
    value = json.loads(canonical(raw))
    exact_keys(value, 'version kind revision source_sha256 graph_sha256 clip_id editor_id job_id editor_version base trim source slice resolution')
    if type(value['version']) is not int or value['version'] != 1 or value['kind'] != 'ordinary-single-slice':
        raise ValueError('Unsupported qualification manifest.')
    if not isinstance(value['revision'], str) or not REVISION.fullmatch(value['revision']):
        raise ValueError('Invalid revision binding.')
    for key in ('source_sha256', 'graph_sha256'):
        if not isinstance(value[key], str) or not HEX64.fullmatch(value[key]):
            raise ValueError('Invalid hash binding.')
    for key in ('clip_id', 'editor_id', 'job_id'):
        if not isinstance(value[key], str) or str(uuid.UUID(value[key])) != value[key]:
            raise ValueError('Invalid identity binding.')
    if type(value['editor_version']) is not int or value['editor_version'] < 1:
        raise ValueError('Invalid editor version.')
    base, trim, source, item = (value[key] for key in ('base', 'trim', 'source', 'slice'))
    exact_keys(base, 'start end duration')
    exact_keys(trim, 'start end')
    exact_keys(source, 'duration')
    exact_keys(item, 'source_start source_end speed canvas_duration output_duration')
    start = number(base['start'], 0, 86400)
    end = number(base['end'], start + .001, 86400)
    duration = number(base['duration'], .001, 86400)
    # Qualification strictness, not a migrated production compatibility rule.
    if abs((end - start) - duration) > .002:
        raise ValueError('Inconsistent base duration.')
    source_duration = number(source['duration'], end, 86400)
    head = number(trim['start'], 0, duration)
    tail = number(trim['end'], -86400, duration)
    selected_start, selected_end = start + head, end - tail
    if selected_end > source_duration + .002 or selected_end <= selected_start:
        raise ValueError('Invalid trimmed source window.')
    selected = selected_end - selected_start
    if selected > 30:
        raise ValueError('Qualification source window exceeds30s.')
    speed = number(item['speed'], .25, 4)
    output = selected / speed
    for key, expected in [('source_start', selected_start), ('source_end', selected_end),
                          ('canvas_duration', output), ('output_duration', output)]:
        if abs(number(item[key], 0, 86400) - expected) > .002:
            raise ValueError('Inconsistent single-slice clock.')
    if output > 30 or output < .1:
        raise ValueError('Qualification output window unsupported.')
    resolution = value['resolution']
    exact_keys(resolution, 'tier width height')
    dimensions = {'720p': (720, 1280), '1080p': (1080, 1920), '1440p': (1440, 2560), '2160p': (2160, 3840)}
    if (not isinstance(resolution['tier'], str) or resolution['tier'] not in dimensions or type(resolution['width']) is not int
            or type(resolution['height']) is not int
            or (resolution['width'], resolution['height']) != dimensions[resolution['tier']]):
        raise ValueError('Unsupported vertical resolution binding.')
    return value, hashlib.sha256(canonical(value)).hexdigest()


def validate_events(raw, manifest_sha256):
    if not isinstance(raw, list) or not 1 <= len(raw) <= 16:
        raise ValueError('Invalid diagnostic event count.')
    result = []
    previous = -1
    terminal = False
    for index, row in enumerate(raw):
        exact_keys(row, 'sequence stage code manifest_sha256')
        if type(row['sequence']) is not int or row['sequence'] != index or terminal:
            raise ValueError('Invalid diagnostic sequence.')
        if row['manifest_sha256'] != manifest_sha256 or row['stage'] not in STAGES or row['code'] not in CODES:
            raise ValueError('Invalid diagnostic binding or enum.')
        stage = STAGES.index(row['stage'])
        if stage <= previous or (row['stage'] != 'failed' and stage != previous + 1):
            raise ValueError('Invalid diagnostic stage order.')
        if row['stage'] == 'failed':
            if row['code'] == 'NONE':
                raise ValueError('Failure code required.')
        elif row['code'] != 'NONE':
            raise ValueError('Unexpected stage error.')
        terminal = row['stage'] in ('complete', 'failed')
        previous = stage
        result.append(dict(row))
    return result


def read_events(work, binding):
    """Fail closed, never copy malformed/raw diagnostic content to the receipt."""
    target = Path(work) / 'diagnostics.json'
    try:
        fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, 'rb') as stream:
            metadata = os.fstat(stream.fileno())
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > 8192:
                raise ValueError('Invalid diagnostic artifact.')
            raw = stream.read(8193)
        if len(raw) > 8192:
            raise ValueError('Diagnostic artifact grew.')
        events = validate_events(json.loads(raw), binding)
        return {'status': 'validated', 'events': events,
                'terminal': events[-1]['stage'] in ('complete', 'failed')}
    except FileNotFoundError:
        return {'status': 'missing'}
    except (OSError, ValueError, TypeError, KeyError):
        return {'status': 'rejected'}
