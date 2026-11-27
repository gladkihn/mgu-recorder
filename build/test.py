"""Offline source tests. Python 3.8+, Node.js 22 and a host C compiler (CC)."""
from pathlib import Path
import json, os, shlex, subprocess, tempfile

R = Path(__file__).resolve().parent.parent
NODE = os.environ.get('NODE', 'node')
checks = []

def run(args, label):
    p = subprocess.run(args, cwd=R, capture_output=True, text=True, timeout=60)
    if p.returncode:
        raise RuntimeError(label + '\n' + p.stdout + p.stderr)
    checks.append({'check': label, 'passed': True})
    print('PASS ' + label, flush=True)

with tempfile.TemporaryDirectory() as tmp:
    for name in ['pixel-ops', 'nv-weave', 'nv-shared']:
        binary = Path(tmp) / (name + ('.exe' if os.name == 'nt' else ''))
        run(shlex.split(os.environ.get('CC', 'cc')) + ['-O2', '-o', str(binary), str(R / 'tests' / (name + '.c'))], name + ' build')
        run([str(binary)], name)
for folder in ['src', 'ui']:
    for f in sorted((R / 'recorder' / folder).glob('*.js')):
        run([NODE, '--check', str(f)], f.relative_to(R).as_posix())
for f in sorted((R / 'tests').glob('*.cjs')):
    run([NODE, str(f)], f.name)
report = {'status': 'PASS', 'checks': checks, 'hardwareExecuted': False}
(R / 'dist').mkdir(exist_ok=True)
(R / 'dist' / 'source-tests.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'status': 'PASS', 'checks': len(checks)}))
