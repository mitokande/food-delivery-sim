"""Recipe registry + render pipeline (normalise, fade, encode, verify) for the audio build."""
import os as _os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")      # BLAS thread spinning is pathologically slow on a busy shared box

import os, json, subprocess
import numpy as np
from lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.environ.get("AUDIO_OUT", os.path.join(REPO, "assets", "audio"))
DL = os.environ.get("AUDIO_DL", "/tmp/fds-audio-dl")
WORK = os.environ.get("AUDIO_WORK", "/tmp/fds-audio-work")

KIND = {
    "oneshot": dict(lufs=-16.0, kbps=96,  stereo=False, loop=False),
    "engine":  dict(lufs=-20.0, kbps=96,  stereo=False, loop=True),
    "amb":     dict(lufs=-26.0, kbps=128, stereo=True,  loop=True),
    "music":   dict(lufs=-18.0, kbps=128, stereo=True,  loop=True),
}
CEIL_DB = -1.5          # sample-peak ceiling before encoding (true peak after encode must be <= -1.0)
REG = {}

def rec(name, kind, src, edit, gain, **kw):
    """Register a recipe.  src = list of (type, id, detail) tuples: ('fs','140384','3.4-8.4 s'),
    ('kenney','impact-sounds','impactSoft_heavy_000.ogg'), ('oga','slug','file'), ('synth','synth.py','function')."""
    def deco(fn):
        REG[name] = dict(name=name, kind=kind, src=src, edit=edit, gain=gain, fn=fn, **kw)
        return fn
    return deco

# ---------------------------------------------------------------- source access
def fs_path(i): return os.path.join(DL, f"fs_{i}", "hq.mp3")
def kn_path(pack, name):
    base = os.path.join(DL, f"kenney_{pack}", "Audio")
    for root, _, files in os.walk(base):
        for f in files:
            if f == name or f == name + ".ogg": return os.path.join(root, f)
    raise FileNotFoundError(f"{pack}/{name}")
def oga_path(slug, fname): return os.path.join(DL, f"oga_{slug}", fname)

def _m(x, mono): return x[:, 0] if mono else x
def fs(i, mono=True, ss=None, t=None): return _m(decode(fs_path(i), mono=mono, ss=ss, t=t), mono)
def kn(pack, name, mono=True, ss=None, t=None): return _m(decode(kn_path(pack, name), mono=mono, ss=ss, t=t), mono)

# ---------------------------------------------------------------- helpers for recipes
def seg(x, a, b): return x[int(a * SR):int(b * SR)]
def gain_db(x, db): return x * 10 ** (db / 20)
def place(parts, n=None):
    """Mix [(array, offset_s, gain_db)] into one array."""
    n = n or max(int(o * SR) + len(a) for a, o, *_ in parts)
    out = np.zeros(n if np.ndim(parts[0][0]) == 1 else (n, parts[0][0].shape[1]))
    for item in parts:
        a, o = item[0], item[1]
        g = 10 ** (item[2] / 20) if len(item) > 2 else 1.0
        i = int(o * SR); m = min(len(a), n - i)
        if m > 0: out[i:i + m] += a[:m] * g
    return out
def mono(x): return x.mean(axis=1) if x.ndim == 2 else x

# ---------------------------------------------------------------- render
def _decode_check(path):
    return decode(path)           # keeps channel count

def render(name, outdir=OUT, verbose=True):
    import zlib, synth
    synth.rng = np.random.default_rng(zlib.crc32(name.encode()))        # per-file seed -> a file never depends on build order
    r = REG[name]; k = KIND[r["kind"]]
    res = r["fn"]()
    extra = {}
    if isinstance(res, tuple): res, extra = res
    x = np.asarray(res, dtype=np.float64)
    want_stereo = r.get("stereo", k["stereo"])
    if x.ndim == 2 and x.shape[1] == 1: x = x[:, 0]
    if x.ndim == 2 and not want_stereo: x = x.mean(axis=1)
    if x.ndim == 2 and want_stereo and np.max(np.abs(x[:, 0] - x[:, 1])) < 1e-9: x = x[:, 0]      # identical channels -> mono file
    loop = r.get("loop", k["loop"])
    if not loop:
        if r.get("trim", True): x = trim_silence(x, thresh_db=r.get("trim_db", -45), pad_ms=(1.5, r.get("tail_ms", 12)))
        x = fade(x, in_ms=r.get("fade_in", 2), out_ms=r.get("fade_out", 25))
    target = r.get("lufs", k["lufs"])
    y, l0, g = normalise(x, target, CEIL_DB)
    # LAME/ffmpeg quirk: length % 1152 in 1..46 decodes up to 46 samples too long (breaks exact loops)
    rem = len(y) % 1152
    if 1 <= rem <= 46:
        if loop: raise RuntimeError(f"{name}: loop length {len(y)} hits the 1152-frame padding quirk; nudge the loop end")
        y = np.pad(y, ((0, 47 - rem),) + ((0, 0),) * (y.ndim - 1))
    kbps = r.get("kbps", k["kbps"])
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, name + ".mp3")
    for attempt in range(4):
        if loop: encode_loop_mp3(y, path, kbps=kbps, mono=(y.ndim == 1))
        else: encode_mp3(y, path, kbps=kbps, mono=(y.ndim == 1))
        d = _decode_check(path)
        tp = true_peak_db(d)
        if tp <= -1.0: break
        y = y * 10 ** ((-1.15 - tp) / 20)                  # pull down by the overshoot and retry
    d = _decode_check(path)
    info = dict(file=name + ".mp3", loop=bool(loop), gain=r["gain"], dur=round(len(d) / SR, 3),
                lufs=round(float(lufs(d)), 1), peak=round(float(true_peak_db(d)), 1), ch=int(d.shape[1]),
                kbps=kbps, bytes=os.path.getsize(path))
    info["len_ok"] = (abs(len(d) - len(y)) <= 1)
    info.update(extra)
    if verbose:
        print(f"{name:<16} {info['dur']:7.3f}s {info['bytes']/1024:7.1f}KB ch{info['ch']} {kbps}k  LUFS {info['lufs']:6.1f} (src {l0:6.1f}, {g:+5.1f} dB)  TP {info['peak']:5.1f}"
              + ("" if info["len_ok"] else "  !! length mismatch") + (f"  hz={extra['hz']}" if 'hz' in extra else ""))
    return info

def seam_report(path, sr=SR):
    """Tile the loop 3x and report how much the seam differs from normal in-loop behaviour (z-scores)."""
    x = decode(path); m = x.mean(axis=1) if x.ndim == 2 else x[:, 0]
    N = len(m); t = np.concatenate([m, m, m])
    seam = N
    def feat(a):
        w = int(0.02 * sr)
        hf = hp(a, 5000, order=2)
        return np.sqrt(np.mean(hf ** 2)), np.sqrt(np.mean(a ** 2))
    # jump in sample value vs typical sample-to-sample difference
    d = np.abs(np.diff(t)); loc = np.median(d[seam - 2000:seam + 2000]) + 1e-9
    jump = abs(t[seam] - t[seam - 1]) / (np.percentile(d, 99.5) + 1e-9)
    # window stats around seam vs distribution over the loop
    w = int(0.05 * sr)
    levels = [np.sqrt(np.mean(t[i:i + w] ** 2)) for i in range(0, N - w, w // 2)]
    a = np.sqrt(np.mean(t[seam - w:seam] ** 2)); b = np.sqrt(np.mean(t[seam:seam + w] ** 2))
    lvl_step_db = 20 * np.log10((b + 1e-9) / (a + 1e-9))
    # spectral continuity: log-spectrum distance across seam vs typical adjacent windows
    def spec(a): return np.log(np.abs(np.fft.rfft(a * np.hanning(len(a)))) + 1e-6)
    W = int(0.1 * sr)
    dseam = np.mean(np.abs(spec(t[seam - W:seam]) - spec(t[seam:seam + W])))
    typ = [np.mean(np.abs(spec(t[i:i + W]) - spec(t[i + W:i + 2 * W]))) for i in range(W, N - 2 * W, max(W, N // 40))]
    z = (dseam - np.mean(typ)) / (np.std(typ) + 1e-9) if len(typ) > 3 else 0.0
    return dict(jump=float(jump), lvl_step_db=float(lvl_step_db), spec_z=float(z))
