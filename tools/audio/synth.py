"""Synthesised sounds for Food Delivery Simulator (all generated here => CC0 / ours).
Every function returns a float64 numpy array (mono unless noted) at 44.1 kHz, un-normalised."""
import os as _os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")      # BLAS thread spinning is pathologically slow on a busy shared box

import numpy as np
from scipy import signal
from lib import SR, lp, hp, bp, fade

rng = np.random.default_rng(20261019)       # fixed seed -> reproducible build

def t_(dur): return np.arange(int(dur * SR)) / SR
def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
def expd(t, tau): return np.exp(-t / tau)

def sine_sweep(f0, f1, dur, expo=True):
    t = t_(dur)
    f = f0 * (f1 / f0) ** (t / dur) if expo else f0 + (f1 - f0) * t / dur
    return np.sin(2 * np.pi * np.cumsum(f) / SR), f

def saw(phase): return 2 * ((phase / (2 * np.pi)) % 1) - 1
def bl_saw(f, dur, nh=None):
    """band-limited additive saw for constant or array f"""
    t = t_(dur) if np.isscalar(dur) else dur
    f = np.broadcast_to(f, t.shape)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.zeros_like(t)
    nh = nh or int((SR / 2) / np.max(f))
    for k in range(1, nh + 1):
        y += np.sin(k * ph) / k * (f * k < SR / 2.2)
    return y * (2 / np.pi)

def bl_square(f, dur, nh=None):
    t = t_(dur)
    f = np.broadcast_to(f, t.shape)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.zeros_like(t)
    nh = nh or int((SR / 2) / np.max(f))
    for k in range(1, nh + 1, 2):
        y += np.sin(k * ph) / k * (f * k < SR / 2.2)
    return y * (4 / np.pi)

def mix(*parts, n=None):
    n = n or max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        arr, off = p if isinstance(p, tuple) else (p, 0)
        off = int(off * SR)
        m = min(len(arr), n - off)
        if m > 0: out[off:off + m] += arr[:m]
    return out

def reverb(x, rt=0.5, wet=0.2, pre_ms=8, seed=1):
    r = np.random.default_rng(seed)
    n = int(rt * SR)
    ir = r.standard_normal(n) * np.exp(-np.arange(n) / (rt * SR / 6.9))
    ir = lp(ir, 5000, order=1)
    ir[: int(pre_ms * SR / 1000)] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    y = signal.fftconvolve(x, ir)[:len(x) + n // 2]
    xx = np.pad(x, (0, len(y) - len(x)))
    return xx * (1 - wet) + y * wet

# ------------------------------------------------------------- instruments
def bell_note(freq, dur=1.2, bright=1.0, tau=0.5, vel=1.0):
    """Struck-bell / glockenspiel-ish: inharmonic partials with individual decays."""
    t = t_(dur)
    parts = [(1.0, 1.0, 1.0), (2.0, 0.55, 0.6), (2.76, 0.35, 0.45), (4.07, 0.22 * bright, 0.3), (5.4, 0.12 * bright, 0.2), (8.9, 0.05 * bright, 0.12)]
    y = np.zeros_like(t)
    for ratio, amp, dec in parts:
        f = freq * ratio
        if f > 16000: continue
        y += amp * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / (tau * dec + 0.02))
    # strike transient
    n = int(0.004 * SR)
    y[:n] += (rng.standard_normal(n) * np.linspace(1, 0, n)) * 0.15 * vel
    y *= np.minimum(1, t / 0.002)
    return y * vel

def marimba_note(freq, dur=0.6, vel=1.0, tau=0.22):
    t = t_(dur)
    y = np.sin(2 * np.pi * freq * t) * np.exp(-t / tau)
    y += 0.45 * np.sin(2 * np.pi * freq * 4 * t) * np.exp(-t / (tau * 0.28))      # marimba 4th partial
    y += 0.12 * np.sin(2 * np.pi * freq * 9.2 * t) * np.exp(-t / (tau * 0.1))
    n = int(0.003 * SR); y[:n] += rng.standard_normal(n) * np.linspace(1, 0, n) * 0.1
    y *= np.minimum(1, t / 0.0015)
    return y * vel

def pluck_note(freq, dur=0.7, vel=1.0, tau=0.3):
    """Karplus-Strong-ish soft pluck (ukulele-ish) for jingles."""
    N = int(SR / freq)
    buf = rng.uniform(-1, 1, N); buf = lp(buf, 3500, order=1)
    out = np.zeros(int(dur * SR))
    damp = 0.996 - 0.0006 * (freq / 440)
    for i in range(len(out)):
        out[i] = buf[i % N]
        buf[i % N] = damp * 0.5 * (buf[i % N] + buf[(i + 1) % N])
    return out * vel * np.exp(-t_(dur) / (tau * 4))


# ------------------------------------------------------------- UI / jingles
def ui_tap():
    t = t_(0.11)
    f = 760 + 520 * np.exp(-t / 0.012)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.022)
    y += 0.35 * np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR) * np.exp(-t / 0.010)
    n = int(0.0025 * SR); y[:n] += lp(rng.standard_normal(n), 5000, order=1) * np.linspace(1, 0, n) * 0.25
    return y

def ui_back():
    t = t_(0.17)
    f = 520 + 330 * np.exp(-t / 0.05) - 120 * (t / 0.17)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.05)
    y += 0.3 * np.sin(2 * np.pi * np.cumsum(f * 2) / SR) * np.exp(-t / 0.02)
    return y

def ui_open():
    """panel slide: soft filtered-noise swoosh rising, landing on a gentle marimba 'tok'"""
    d = 0.34
    t = t_(d)
    nz = rng.standard_normal(len(t))
    # time-varying band-pass via crossfaded static filters
    sw = np.zeros_like(t)
    centers = np.geomspace(500, 3200, 8)
    for i, c in enumerate(centers):
        band = bp(nz, c * 0.75, min(c * 1.35, 9000), order=2)
        pos = (i + 0.5) / len(centers) * 0.16
        w = np.exp(-((t - pos) ** 2) / (2 * 0.035 ** 2))
        sw += band * w
    sw *= 1.4
    tok = marimba_note(midi(79), 0.3, tau=0.12)
    return mix(sw * 0.55, (tok * 0.55, 0.15), n=len(t))

def ui_error():
    parts = []
    for i, f0 in enumerate([208, 156]):
        d = 0.13
        t = t_(d)
        y = bl_square(f0 * (1 + 0.04 * np.exp(-t / 0.02)), d, nh=9) * 0.5 + 0.5 * np.sin(2 * np.pi * f0 * t)
        y = lp(y, 1400, order=2) * np.minimum(1, t / 0.004) * np.exp(-t / 0.10)
        parts.append((y, i * 0.115))
    return mix(*parts, n=int(0.34 * SR))

def countdown_tick():
    t = t_(0.075)
    body = np.sin(2 * np.pi * 540 * t) * np.exp(-t / 0.016)
    click = np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.004)
    n = int(0.002 * SR); click[:n] += rng.standard_normal(n) * 0.3
    return body * 0.8 + click * 0.7

def notif_order():
    """phone-like two-note ping (perfect fifth up) with a soft bell tail"""
    a = bell_note(midi(79), 0.9, bright=0.7, tau=0.35)          # G5
    b = bell_note(midi(86), 1.0, bright=0.7, tau=0.45)          # D6
    return reverb(mix((a * 0.8, 0), (b, 0.12), n=int(1.1 * SR)), rt=0.35, wet=0.12)

def ui_unlock():
    """lock 'ka-chunk' then a rising sparkle"""
    t = t_(0.08)
    clunk = (np.sin(2 * np.pi * 160 * t * (1 + 0.5 * np.exp(-t / 0.01))) * np.exp(-t / 0.02)
             + 0.5 * lp(rng.standard_normal(len(t)), 3500, order=1) * np.exp(-t / 0.008))
    click = hp(rng.standard_normal(int(0.02 * SR)), 2500, order=1) * np.exp(-t_(0.02) / 0.004)
    notes = [(midi(m), 0.11 + 0.075 * i) for i, m in enumerate([84, 88, 91, 96])]
    sp = [(bell_note(f, 0.9, bright=1.0, tau=0.35) * (0.55 + 0.1 * i), s) for i, (f, s) in enumerate(notes)]
    return reverb(mix((clunk * 0.9, 0), (click * 0.5, 0.045), *sp, n=int(1.2 * SR)), rt=0.4, wet=0.15)

def _chord(freqs, dur, vel=0.5, kind="bell"):
    fn = (lambda f: bell_note(f, dur, bright=0.9, tau=0.6, vel=vel)) if kind == "bell" else (lambda f: marimba_note(f, dur, vel=vel, tau=0.4))
    return sum(fn(f) for f in freqs)

def ui_levelup():
    """C-major fanfare: rising marimba run -> bell chord with sparkle (about 2 s)"""
    run = [72, 76, 79, 84, 88]                     # C5 E5 G5 C6 E6
    parts = []
    for i, m in enumerate(run):
        parts.append((marimba_note(midi(m), 0.5, vel=0.8, tau=0.2) + 0.35 * bell_note(midi(m + 12), 0.5, tau=0.2), 0.0 + i * 0.095))
    tchord = 0.095 * len(run) + 0.02
    ch = _chord([midi(79), midi(84), midi(88), midi(91)], 1.4, vel=0.45)
    ch2 = marimba_note(midi(60), 0.9, vel=0.9, tau=0.3) + marimba_note(midi(67), 0.9, vel=0.6, tau=0.3)
    sp = [(bell_note(midi(96 + k), 0.7, bright=1.0, tau=0.2, vel=0.25), tchord + 0.06 * k) for k in (0, 4, 7)]
    y = mix(*parts, (ch, tchord), (ch2, tchord), *sp, n=int(2.3 * SR))
    return reverb(y, rt=0.6, wet=0.16)

def order_complete():
    """short upbeat 'ta-da-da-daaa' on marimba+bell, G major"""
    seq = [(67, 0.0), (71, 0.11), (74, 0.22), (79, 0.36)]      # G4 B4 D5 G5
    parts = [(marimba_note(midi(m), 0.6, vel=0.85, tau=0.25) + 0.4 * bell_note(midi(m + 12), 0.6, tau=0.25), s) for m, s in seq]
    ch = _chord([midi(79), midi(83), midi(86)], 1.0, vel=0.4)
    low = marimba_note(midi(55), 0.9, vel=0.7, tau=0.35)
    y = mix(*parts, (ch, 0.36), (low, 0.36), n=int(1.6 * SR))
    return reverb(y, rt=0.5, wet=0.14)

def qte_good():
    a = marimba_note(midi(84), 0.4, vel=0.9, tau=0.14) + 0.5 * bell_note(midi(96), 0.4, tau=0.15)
    b = marimba_note(midi(91), 0.6, vel=1.0, tau=0.2) + 0.5 * bell_note(midi(103), 0.6, tau=0.2)
    return reverb(mix((a, 0), (b, 0.085), n=int(0.8 * SR)), rt=0.3, wet=0.1)

def qte_bad():
    d = 0.45
    t = t_(d)
    f = 205 * np.exp(-0.9 * t / d) * (1 + 0.012 * np.sin(2 * np.pi * 7 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = (np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph)) * np.minimum(1, t / 0.005) * np.exp(-t / 0.22)
    y = lp(y, 1100, order=2)
    th = np.sin(2 * np.pi * 70 * t * (1 + np.exp(-t / 0.03))) * np.exp(-t / 0.05) * 0.8
    return y + th

def event_pop():
    """attention sting: bubble pop (sweep up) + bright two-note ding with sparkle"""
    t = t_(0.09)
    f = 260 * (1 + 3.2 * (t / 0.09) ** 0.7)
    pop = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035) * np.minimum(1, t / 0.002)
    a = bell_note(midi(88), 0.9, bright=0.8, tau=0.3)
    b = bell_note(midi(95), 1.1, bright=0.8, tau=0.4, vel=0.8)
    sp = bell_note(midi(107), 0.5, bright=0.6, tau=0.15, vel=0.3)
    y = mix((pop * 0.9, 0), (a * 0.7, 0.07), (b * 0.7, 0.17), (sp, 0.17), n=int(1.2 * SR))
    return reverb(y, rt=0.4, wet=0.14)

# ------------------------------------------------------------- vehicle one-shots (synth)
def horn_tone(freqs, dur, att=0.012, rel=0.05, buzz=90, buzz_depth=0.18, cut=3200, nh=None, drop=0.0):
    t = t_(dur)
    y = np.zeros_like(t)
    for i, f in enumerate(freqs):
        ff = f * (1 - drop * np.clip((t - (dur - 0.08)) / 0.08, 0, 1)) * (1 + 0.025 * np.exp(-t / 0.02))
        y += bl_square(ff * (1 + 0.0015 * i), dur, nh=nh or 11) * 0.55 + bl_saw(ff, dur, nh=nh or 14) * 0.45
    y *= 1 + buzz_depth * np.sin(2 * np.pi * buzz * t)
    y = lp(y, cut, order=2)
    env = np.minimum(1, t / att) * np.minimum(1, (dur - t) / rel)
    return y * env

def horn_moped():
    """weak, tinny single-tone parp"""
    y = horn_tone([392], 0.30, att=0.015, rel=0.06, buzz=110, buzz_depth=0.25, cut=2400, nh=9, drop=0.08)
    y = hp(y, 300, order=2)
    return y

def horn_scooter():
    """beep-beep, small two-tone horn"""
    a = horn_tone([466, 587], 0.16, att=0.010, rel=0.03, buzz=100, buzz_depth=0.15, cut=3200, nh=10)
    return mix((a, 0), (a, 0.23), n=int(0.5 * SR))

def horn_sport():
    """stronger, deeper dual-tone honk with a little room"""
    y = horn_tone([370, 466, 740], 0.52, att=0.008, rel=0.08, buzz=120, buzz_depth=0.12, cut=4200, nh=14)
    return reverb(y, rt=0.25, wet=0.1)

def siren_short():
    """police 'whoop-whoop-whoop' : three fast rising sweeps"""
    parts = []
    for i in range(3):
        d = 0.30
        t = t_(d)
        f = 620 * (1480 / 620) ** (np.clip(t / 0.26, 0, 1) ** 0.9)
        ph = 2 * np.pi * np.cumsum(f) / SR
        y = np.sin(ph) + 0.55 * np.sin(2 * ph) + 0.3 * np.sin(3 * ph) + 0.15 * np.sin(5 * ph)
        env = np.minimum(1, t / 0.01) * np.minimum(1, (d - t) / 0.035)
        parts.append((y * env, i * 0.34))
    return reverb(mix(*parts, n=int(1.45 * SR)), rt=0.5, wet=0.18)

def doorbell():
    """ding-dong: two tubular-bell notes E5 -> C5"""
    def tube(f, dur):
        t = t_(dur)
        y = np.zeros_like(t)
        for r, a, tau in [(1, 1.0, 0.9), (2.0, 0.45, 0.6), (3.0, 0.25, 0.45), (4.16, 0.18, 0.3), (5.43, 0.1, 0.2), (6.8, 0.05, 0.12)]:
            y += a * np.sin(2 * np.pi * f * r * t * (1 + 0.0007 * rng.standard_normal())) * np.exp(-t / tau)
        y *= np.minimum(1, t / 0.002)
        return y
    a = tube(midi(76), 1.5)           # E5
    b = tube(midi(72), 1.9)           # C5
    return reverb(mix((a, 0), (b * 0.95, 0.52), n=int(2.3 * SR)), rt=0.5, wet=0.14)

def boing(f0=210, depth=1.3, dur=0.55, vib=21):
    t = t_(dur)
    f = f0 * (1 + depth * np.exp(-t / 0.10)) + 38 * np.exp(-t / 0.22) * np.sin(2 * np.pi * vib * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = (np.sin(ph) + 0.35 * np.sin(2 * ph + 0.6)) * np.exp(-t / 0.13) * np.minimum(1, t / 0.003)
    return y

def hop():
    y = boing(190, 1.5, 0.5, 19)
    t = t_(0.5)
    whap = lp(rng.standard_normal(len(t)), 1800, order=1) * np.exp(-t / 0.012) * 0.35
    return y + whap

def land():
    t = t_(0.28)
    thud = np.sin(2 * np.pi * np.cumsum(58 + 90 * np.exp(-t / 0.035)) / SR) * np.exp(-t / 0.07)
    body = lp(rng.standard_normal(len(t)), 700, order=2) * np.exp(-t / 0.025) * 0.8
    tap = lp(rng.standard_normal(len(t)), 2500, order=1) * np.exp(-t / 0.006) * 0.35
    return thud + body + tap
