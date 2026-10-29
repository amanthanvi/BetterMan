"""Only generated lines execute, inside this disposable mount-free container.
Both target executables were replaced by marker ELF binaries at image build.
"""
import json
import subprocess
import sys
from pathlib import Path

root = Path('/scratch')
root.mkdir(exist_ok=True)
for record in sys.stdin:
    case = json.loads(record)
    hit = root / 'target-ran'
    hit.unlink(missing_ok=True)
    for name in ['x', 'f', 'input']:
        (root / name).write_text('item\n')
    try:
        proc = subprocess.run(
            ['/bin/bash', '--noprofile', '--norc', '-c', case['cmd']],
            cwd=root, input='item\n', capture_output=True, text=True,
            env={'PATH': '/usr/bin:/bin', 'HOME': '/root', 'LC_ALL': 'C'}, timeout=8,
        )
        result = {'id': case['id'], 'ran': hit.exists(), 'status': proc.returncode}
    except subprocess.TimeoutExpired:
        result = {'id': case['id'], 'timeout': True}
    print(json.dumps(result), flush=True)
