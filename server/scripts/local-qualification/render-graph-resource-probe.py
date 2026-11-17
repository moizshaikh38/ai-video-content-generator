#!/usr/bin/env python3
"""Bounded, opt-in diagnostic. Never invoked by normal render jobs.

The graph is a JSON CompiledRenderGraph from compileRenderGraph. This does not
qualify picture, sound, captions, encoder performance or production capacity.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('graph', type=Path)
parser.add_argument('--ffmpeg', default='ffmpeg')
parser.add_argument('--output-dir', required=True, type=Path)
parser.add_argument('--seconds', type=float, default=15)
parser.add_argument('--max-rss-kib', type=int, default=420000)
parser.add_argument('--default-filter-threads', action='store_true')
args = parser.parse_args()
if not 0 < args.seconds <= 30 or not 0 < args.max_rss_kib <= 500000:
    parser.error('Diagnostic limits: at most 30 seconds and 500000 KiB RSS.')
graph = json.loads(args.graph.read_text())
args.output_dir.mkdir(parents=True, exist_ok=False)
thread_args = [] if args.default_filter_threads else ['-filter_complex_threads', '1', '-filter_threads', '1']
command = [args.ffmpeg, '-hide_banner', '-nostdin', '-v', 'warning', *thread_args,
           *graph['inputArgs'], '-filter_complex', ';'.join(graph['filterComplex']),
           '-map', graph['videoMap'], '-map', graph['audioMap'],
           '-t', str(graph['duration']), '-f', 'null', '-']
start = time.monotonic()
peak_rss = peak_threads = 0
stop_reason = None
with (args.output_dir / 'ffmpeg.log').open('w') as log:
    child = subprocess.Popen(command, stdout=log, stderr=log, start_new_session=True)
    try:
        while child.poll() is None:
            try:
                rows = Path('/proc', str(child.pid), 'status').read_text().splitlines()
                status = dict(row.split(':', 1) for row in rows if ':' in row)
                peak_rss = max(peak_rss, int(status.get('VmRSS', '0 kB').split()[0]))
                peak_threads = max(peak_threads, int(status.get('Threads', '0')))
            except FileNotFoundError:
                pass
            if peak_rss > args.max_rss_kib:
                stop_reason = 'RSS safety stop'
            elif time.monotonic() - start > args.seconds:
                stop_reason = 'wall-clock safety stop'
            if stop_reason:
                break
            time.sleep(.05)
    finally:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
        child.wait()
result = dict(returncode=child.returncode, elapsedSeconds=round(time.monotonic()-start, 3),
              peakRssKiB=peak_rss, peakThreads=peak_threads, stopReason=stop_reason,
              canvas=graph.get('canvas'), command=command,
              caveat='50ms sampled child RSS, not host/cgroup peak. Null output, no encoder.')
(args.output_dir / 'result.json').write_text(json.dumps(result, indent=2))
print(json.dumps({key: value for key, value in result.items() if key != 'command'}))
raise SystemExit(0 if child.returncode == 0 else 1)
