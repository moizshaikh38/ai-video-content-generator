"""LOCAL ONLY diagnostic preparation. No default workload and no automatic retry.

Inspect with --help. Running requires BOTH --run and VIREO_ALLOW_BOUNDED_DIAGNOSTIC=1.
This is not permission to run a 4K/API probe. Review the command and owner scope first.
Command JSON is an argv array, not shell text. Only a local ffmpeg executable is allowed.
Records phase, child/process-group RSS, cgroup counters and terminal status before cleanup.
Does not upload, call APIs, change render defaults or infer an OOM from a timeout.
"""
import argparse, json, os, pathlib, signal, subprocess, time


def cgroup_snapshot():
    try:
        relative = next(line.strip().split(':', 2)[2] for line in open('/proc/self/cgroup') if line.startswith('0::'))
        base = pathlib.Path('/sys/fs/cgroup') / relative.lstrip('/')
        result = {'path': str(base)}
        for name in ['memory.max', 'memory.current', 'memory.peak', 'memory.events', 'cpu.max']:
            p = base / name
            if p.exists():
                result[name] = p.read_text().strip()
        return result
    except (OSError, StopIteration) as error:
        return {'unavailable': str(error)}


def group_sample(pgid):
    rows = []
    for proc in pathlib.Path('/proc').iterdir():
        if not proc.name.isdecimal():
            continue
        try:
            pid = int(proc.name)
            if os.getpgid(pid) != pgid:
                continue
            data = {}
            for line in (proc / 'status').read_text().splitlines():
                key, _, value = line.partition(':')
                if key in ['VmRSS', 'Threads', 'Name']:
                    data[key] = value.strip()
            rows.append({'pid': pid, 'rss_kib': int(data.get('VmRSS', '0 kB').split()[0]), 'threads': int(data.get('Threads', '0')), 'name': data.get('Name')})
        except (OSError, ValueError, ProcessLookupError):
            continue
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--argv-json', required=True, help='Existing JSON file with reviewed ffmpeg argv array')
    parser.add_argument('--output-dir', required=True, help='New private local output directory; must not exist')
    parser.add_argument('--rss-limit-mib', type=int, default=450)
    parser.add_argument('--seconds', type=int, default=15)
    parser.add_argument('--run', action='store_true')
    args = parser.parse_args()
    if not args.run or os.environ.get('VIREO_ALLOW_BOUNDED_DIAGNOSTIC') != '1':
        parser.error('Diagnostic execution held. Both explicit run gates are required after scope review.')
    if not 64 <= args.rss_limit_mib <= 512 or not 1 <= args.seconds <= 30:
        parser.error('Preparation permits only64–512MiB and1–30seconds')
    argv = json.loads(pathlib.Path(args.argv_json).read_text())
    if not isinstance(argv, list) or not argv or not all(isinstance(v, str) and v for v in argv):
        parser.error('argv must be nonempty string array')
    binary = pathlib.Path(argv[0]).resolve()
    if binary.name != 'ffmpeg' or not binary.is_file() or '-nostdin' not in argv:
        parser.error('Only an existing ffmpeg executable with -nostdin is supported')
    directory = pathlib.Path(args.output_dir)
    directory.mkdir(mode=0o700, parents=False, exist_ok=False)
    report = {'phase': 'preflight', 'argv': argv, 'cgroup_before': cgroup_snapshot(), 'rss_limit_mib': args.rss_limit_mib, 'timeout_seconds': args.seconds, 'samples': [], 'no_automatic_retry': True}
    target = directory / 'report.json'
    def save():
        target.write_text(json.dumps(report, indent=2))
    save()
    child = None
    try:
        with open(directory / 'stdout.log', 'wb') as out, open(directory / 'stderr.log', 'wb') as err:
            start = time.monotonic()
            child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=out, stderr=err, start_new_session=True)
            report.update(phase='running', pid=child.pid, pgid=child.pid)
            save()
            while child.poll() is None:
                rows = group_sample(child.pid)
                rss = sum(row['rss_kib'] for row in rows)
                elapsed = round(time.monotonic() - start, 3)
                report['samples'].append({'seconds': elapsed, 'group_rss_kib': rss, 'processes': rows})
                reason = 'rss_limit' if rss > args.rss_limit_mib * 1024 else 'wall_timeout' if elapsed >= args.seconds else 'log_limit' if out.tell() + err.tell() > 4 * 1024 * 1024 else None
                if reason:
                    report.update(phase='stopping', stop_reason=reason, cgroup_at_stop=cgroup_snapshot())
                    save()
                    os.killpg(child.pid, signal.SIGTERM)
                    try:
                        child.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        os.killpg(child.pid, signal.SIGKILL)
                        child.wait()
                    break
                save()
                time.sleep(.1)
            report.update(phase='finished', exit_code=child.wait(), elapsed_seconds=round(time.monotonic() - start, 3), cgroup_after=cgroup_snapshot())
    finally:
        if child:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        save()
    print(target)


if __name__ == '__main__':
    main()
