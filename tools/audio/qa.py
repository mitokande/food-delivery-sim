#!/usr/bin/env python3
"""Quality gate for assets/audio (or $AUDIO_OUT): format, duration, loudness, peaks, edge clicks, loop seams, size budget.
   python3 -I qa.py [dir]"""
import os as _os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import os, sys, json, subprocess
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "audio")
man = json.load(open(os.path.join(D, "manifest.json")))
bad = []; total = 0

def probe(p):
    j = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,sample_rate,channels,bit_rate",
                                   "-show_entries", "format=duration,format_name", "-of", "json", p], capture_output=True, text=True).stdout)
    return j["streams"][0], j["format"]

def hf_env(m, sr=SR, win=0.004):
    h = hp(m, 4000, order=2); w = int(win * sr)
    n = len(h) // w
    return np.sqrt(np.mean(h[:n * w].reshape(n, w) ** 2, axis=1)), w

print(f"{'name':<16}{'dur':>8}{'LUFS':>7}{'TPdB':>6}{'ch':>3}{'kHz':>5}{'kbps':>5}{'KB':>7}  checks")
for name, e in man.items():
    p = os.path.join(D, e["file"]); sz = os.path.getsize(p); total += sz
    st, fm = probe(p)
    x = decode(p); m = x.mean(axis=1); n = len(m); issues = []
    if st["codec_name"] != "mp3": issues.append("codec " + st["codec_name"])
    if st["sample_rate"] != "44100": issues.append("sr " + st["sample_rate"])
    if abs(n / SR - e["dur"]) > 0.002: issues.append(f"dur {n/SR:.3f} != manifest {e['dur']}")
    if x.shape[1] != e["ch"]: issues.append("channels")
    tp = true_peak_db(x)
    if tp > -1.0: issues.append(f"TP {tp:.1f}")
    # edges: no click at start/end of one-shots (first/last 1 ms should be near zero)
    if not e["loop"]:
        pk = np.max(np.abs(m))
        a = np.max(np.abs(m[:3])); b = np.max(np.abs(m[-3:]))          # first/last samples must start/end at ~0 (no click)
        if a > 0.03 * pk: issues.append(f"start edge {a/pk:.3f}")
        if b > 0.03 * pk: issues.append(f"end edge {b/pk:.3f}")
    else:
        # loop seam: tile x3, compare HF burst at seam vs the 99th percentile elsewhere, and sample jump vs local slope
        t = np.concatenate([m, m, m]); env, w = hf_env(t)
        s_idx = n // w; near = env[s_idx - 1:s_idx + 2].max(); far = np.percentile(np.concatenate([env[:s_idx - 6], env[s_idx + 6:2 * s_idx - 6]]), 99.5)
        jump = abs(t[n] - t[n - 1]); slope = np.percentile(np.abs(np.diff(t)), 99.9)
        ratio = near / (far + 1e-12)
        if ratio > 1.25: issues.append(f"seam HF burst x{ratio:.2f}")
        if jump > 1.5 * slope: issues.append(f"seam jump {jump:.4f} vs {slope:.4f}")
        issues.append(f"seam ok(hf x{ratio:.2f}, jump {jump / (slope + 1e-9):.2f})") if not [i for i in issues if i.startswith("seam")] else None
    print(f"{name:<16}{n/SR:8.3f}{lufs(x):7.1f}{tp:6.1f}{x.shape[1]:3d}{int(st['sample_rate'])/1000:5.1f}{int(st.get('bit_rate', 0))//1000:5d}{sz/1024:7.1f}  " + "; ".join(issues))
    bad += [(name, i) for i in issues if not i.startswith("seam ok")]
print(f"\ntotal {total/1024/1024:.2f} MB for {len(man)} files (budget 6 MB)")
if total > 6 * 1024 * 1024: bad.append(("*", "over budget"))
print("PROBLEMS:", bad if bad else "none")
