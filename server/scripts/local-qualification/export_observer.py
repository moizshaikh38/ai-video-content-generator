#!/usr/bin/env python3
"""Opt-in qualification observer. Inert on import, never called by render jobs.

Only start an isolated worker that does not consume shared render queues. This
observer does not make that promise true or change production retry behavior.
Logs are drained and counted, not retained, because worker output may contain
private signed URLs, source text or credentials. Capture safe diagnostics in the
worker's structured result separately. No shell invocation is used.
"""
import hashlib
import json
import os
from pathlib import Path
import selectors
import shutil
import signal
import subprocess
import time


class ObserverSignal(BaseException):
    def __init__(self, number):
        self.number = number


def cgroup_snapshot():
    result = {}
    try:
        relative = next(line.split(':', 2)[2] for line in Path('/proc/self/cgroup').read_text().splitlines() if line.startswith('0::'))
        root = Path('/sys/fs/cgroup') / relative.lstrip('/')
        for name in ('memory.current', 'memory.max', 'memory.peak', 'memory.events'):
            result[name] = (root / name).read_text().strip()
    except (OSError, StopIteration):
        result['unavailable'] = True
    return result


def session_processes(session):
    rows = []
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            # comm can contain spaces and parentheses. Parse after its LAST ')'.
            fields = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
            if int(fields[3]) != session or fields[0] == 'Z':
                continue
            rows.append({'pid': int(entry.name), 'group': int(fields[2]),
                         'rss_bytes': int(fields[21]) * os.sysconf('SC_PAGE_SIZE')})
        except (OSError, ValueError, IndexError):
            continue
    return rows


def tree_bytes(directory):
    total = 0
    for root, directories, files in os.walk(directory, followlinks=False):
        directories[:] = [name for name in directories if not (Path(root) / name).is_symlink()]
        for name in files:
            p = Path(root) / name
            if not p.is_symlink():
                try:
                    total += p.stat().st_size
                except FileNotFoundError:
                    pass
    return total


def observe(command, evidence, *, timeout_seconds=10, max_rss_bytes=200*1024*1024,
            max_work_bytes=16*1024*1024, reserve_free_bytes=128*1024*1024,
            sample_seconds=.05, cancel=None):
    """Supervise one newly-created Linux session; no production imports/hooks.

    Descendants that keep the session but change process groups are included.
    A child that calls setsid can escape. A killed supervisor cannot clean up.
    The caller must use a stronger isolated cgroup/container before real media.
    """
    if not command or not all(isinstance(arg, str) and '\x00' not in arg for arg in command):
        raise ValueError('A nonempty argument vector is required.')
    if not (0 < timeout_seconds <= 30 and 0 < max_rss_bytes <= 500*1024*1024
            and 0 < max_work_bytes <= 512*1024*1024 and reserve_free_bytes > 0
            and .01 <= sample_seconds <= .25):
        raise ValueError('Invalid qualification safety limits.')
    evidence = Path(evidence).resolve()
    evidence.mkdir(parents=True, exist_ok=False)
    work = evidence / 'owned-work'
    work.mkdir()
    started = time.monotonic()
    receipt = {'version': 1, 'state': 'started', 'observer_pid': os.getpid(),
               'command_sha256': hashlib.sha256(json.dumps(command).encode()).hexdigest(),
               'limits': {'seconds': timeout_seconds, 'rss_bytes': max_rss_bytes,
                          'work_bytes': max_work_bytes, 'reserve_free_bytes': reserve_free_bytes},
               'sample_seconds': sample_seconds, 'peak_session_rss_bytes': 0,
               'peak_work_bytes': 0, 'stdout_bytes': 0, 'stderr_bytes': 0,
               'cgroup_before': cgroup_snapshot(), 'free_disk_before': shutil.disk_usage(work).free,
               'coverage': 'sampled Linux session, not escaped descendants or a private cgroup',
               'log_policy': 'content suppressed; byte counts only'}
    def persist():
        receipt['elapsed_seconds'] = round(time.monotonic() - started, 4)
        temp = evidence / 'receipt.tmp'
        with temp.open('w') as stream:
            json.dump(receipt, stream, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, evidence / 'receipt.json')
    persist()
    process = None
    selector = selectors.DefaultSelector()
    reason = None
    last_persist = started
    prior_handlers = {}
    def interrupted(number, frame):
        raise ObserverSignal(number)
    try:
        for number in (signal.SIGTERM, signal.SIGINT):
            prior_handlers[number] = signal.signal(number, interrupted)
        if shutil.disk_usage(work).free < reserve_free_bytes:
            reason = 'disk-reserve-preflight'
            return receipt
        environment = os.environ.copy()
        environment['VIREO_QUALIFICATION_WORKDIR'] = str(work)
        process = subprocess.Popen(command, cwd=work, env=environment, start_new_session=True,
                                   stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        receipt['worker_pid'] = process.pid
        persist()
        for name, stream in [('stdout_bytes', process.stdout), ('stderr_bytes', process.stderr)]:
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, name)
        while True:
            for key, _ in selector.select(sample_seconds):
                block = os.read(key.fd, 65536)
                if block:
                    receipt[key.data] += len(block)
                else:
                    selector.unregister(key.fileobj)
            rows = session_processes(process.pid)
            rss = sum(row['rss_bytes'] for row in rows)
            receipt['peak_session_rss_bytes'] = max(receipt['peak_session_rss_bytes'], rss)
            size = tree_bytes(work)
            receipt['peak_work_bytes'] = max(receipt['peak_work_bytes'], size)
            free = shutil.disk_usage(work).free
            elapsed = time.monotonic() - started
            if cancel is not None and cancel():
                reason = 'cancelled'
            elif elapsed > timeout_seconds:
                reason = 'wall-clock-safety-stop'
            elif rss > max_rss_bytes:
                reason = 'sampled-memory-safety-stop'
            elif size > max_work_bytes:
                reason = 'owned-work-disk-limit'
            elif free < reserve_free_bytes:
                reason = 'free-disk-reserve-stop'
            elif process.poll() is not None:
                reason = 'worker-exit-with-descendants' if rows else 'worker-exit'
            if reason:
                break
            if time.monotonic() - last_persist >= .25:
                persist()
                last_persist = time.monotonic()
    except ObserverSignal as error:
        reason = 'observer-interrupted'
        receipt['observer_signal'] = error.number
    except BaseException as error:
        # Never persist raw exception strings, which can contain command args.
        reason = 'observer-error'
        receipt['observer_error_type'] = type(error).__name__
    finally:
        if process is not None:
            # Kill all discovered groups in our newly-owned session, not our
            # caller's group. Also target the initial group if /proc raced.
            groups = {row['group'] for row in session_processes(process.pid)} | {process.pid}
            for group in groups:
                try:
                    os.killpg(group, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            process.wait()
            receipt['worker_returncode'] = process.returncode
            receipt['worker_signal'] = -process.returncode if process.returncode < 0 else None
            until = time.monotonic() + 1
            while session_processes(process.pid) and time.monotonic() < until:
                time.sleep(.01)
            receipt['remaining_session_pids'] = [r['pid'] for r in session_processes(process.pid)]
            # Drain remaining buffered output without retaining private content.
            for stream, name in [(process.stdout, 'stdout_bytes'), (process.stderr, 'stderr_bytes')]:
                while True:
                    try:
                        block = os.read(stream.fileno(), 65536)
                    except BlockingIOError:
                        break
                    if not block:
                        break
                    receipt[name] += len(block)
                stream.close()
        selector.close()
        for number, handler in prior_handlers.items():
            signal.signal(number, handler)
        receipt['stop_reason'] = reason
        receipt['state'] = 'finished'
        receipt['cgroup_after'] = cgroup_snapshot()
        receipt['free_disk_after'] = shutil.disk_usage(work).free
        receipt['cleanup'] = 'owned-work-only'
        shutil.rmtree(work)
        persist()
    return receipt
