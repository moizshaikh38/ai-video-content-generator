"""Qualification-only three-context camera candidate. Not semantic role proof/defaults.
Usage: python gaming-uniform-boundary.py video analysis.json output.json
Uses only three deterministic windows from THIS clip, no source-specific rectangles.
Short clips, missing/multiple faces or ambiguous seams remain unresolved.
"""
import json, sys, tempfile, pathlib, importlib.util

def context_samples(samples, duration):
    width = 4.0
    if duration < 16:
        raise ValueError('Need at least16s for three separated contexts')
    starts = [duration * .05, duration / 2 - width / 2, duration * .95 - width]
    contexts = []
    for start in starts:
        rows = [s for s in samples if start <= s['time'] < start + width]
        if len(rows) < 8 or any(len(s.get('faces', [])) != 1 for s in rows):
            raise ValueError('Every context requires >=8 samples with exactly one face each')
        contexts.append((start, rows))
    return contexts

def main(video, analysis_path, output_path):
    record = json.load(open(analysis_path))
    duration = record.get('metadata', {}).get('clip_duration', 0)
    module_path = pathlib.Path(__file__).with_name('gaming-context-boundary.py')
    spec = importlib.util.spec_from_file_location('boundary_qualification', module_path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    try:
        contexts = context_samples(record.get('raw_samples', []), duration)
        with tempfile.TemporaryDirectory(prefix='vireo-cam-context-') as folder:
            pairs = []
            for index, (start, samples) in enumerate(contexts):
                p = str(pathlib.Path(folder) / (str(index) + '.json'))
                json.dump({'samples': samples}, open(p, 'w')); pairs.append((video, p))
            result = module.run(pairs)
        result['context_windows'] = [{'start': s, 'end': s+4} for s, _ in contexts]
    except ValueError as e:
        result = {'status': 'unresolved', 'not_production': True, 'reason': str(e)}
    result['policy'] = 'qualification_uniform_three_contexts_v1'
    json.dump(result, open(output_path, 'w'), indent=2)
    print(json.dumps(result))

if __name__ == '__main__':
    main(*sys.argv[1:])
