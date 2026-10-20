"""All sound recipes (what goes into each file).  Registered with core.rec; built by build.py."""
import os as _os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")      # BLAS thread spinning is pathologically slow on a busy shared box

import numpy as np
from core import *
from lib import *
import synth as S
from music import beat_grid, search_loops

# =====================================================================================
#  helpers
# =====================================================================================
def safe_e(s, e, max_e):
    """ffmpeg/LAME quirk: an MP3 whose length N has N % 1152 in 1..46 decodes up to 46 samples too long, which would
    break an exact loop.  Nudge the loop end so the length avoids that window (<= 1 ms change)."""
    r = (e - s) % 1152
    if 1 <= r <= 46:
        e2 = e + (47 - r)
        return e2 if e2 <= max_e else e - r
    return e

def engine_loop(path_fn, t0, t1, lo, hi, F=0.12, hpf=35, lpf=None, mono_in=True):
    """Seamless loop out of a steady-idle stretch [t0,t1] of a recording.
    Picks the loop points (length lo..hi s) whose following F seconds best match, then cross-fades the
    material after the loop end into the loop head so the seam is the original continuous signal."""
    x = path_fn()
    m = x if x.ndim == 1 else x[:, 0]
    m = hp(m, hpf)
    if lpf: m = lp(m, lpf)
    m = m[int(t0 * SR):int(t1 * SR)]
    s, e, sc = find_loop(m, lo, hi, int(F * SR), step=int(0.01 * SR))
    e = safe_e(s, e, len(m) - int(F * SR))
    loop = make_loop_xfade(m, s, e, int(F * SR), power=False)
    dur = len(loop) / SR
    env = lp(np.abs(loop - loop.mean()), 400); env -= env.mean()
    ac = np.fft.irfft(np.abs(np.fft.rfft(env, 2 * len(env))) ** 2)[:len(env)]; ac /= ac[0]
    k = int(np.argmax(ac[int(SR / 120):int(SR / 8)])) + int(SR / 120)
    fe = SR / k
    # pulse rate: earliest autocorrelation peak that is >=85 % of the best one within 8..60 Hz (avoids octave errors)
    from scipy.signal import find_peaks
    lo_l, hi_l = int(SR / 60), int(SR / 8)
    seg_ac = ac[lo_l:hi_l]
    pk, _ = find_peaks(seg_ac, height=0.85 * seg_ac.max())
    fe = SR / (pk[0] + lo_l)
    nfire = max(1, round(fe * dur))
    hz = nfire / dur
    return loop, dict(hz=round(hz, 1), loop_corr=round(float(sc), 3), pulses=int(nfire))

def level_ride(x, win=2.0, strength=0.65, max_db=4.0):
    """slow, circular gain riding that flattens long swells (keeps the loop seam continuous)"""
    from scipy.ndimage import uniform_filter1d
    m = x.mean(axis=1) if x.ndim == 2 else x
    k = int(win * SR); sq = m ** 2
    ext = np.concatenate([sq[-k:], sq, sq[:k]])
    env = np.sqrt(uniform_filter1d(ext, size=k, mode="nearest"))[k:-k]
    db = 20 * np.log10(env + 1e-9)
    g = 10 ** (np.clip(-(db - np.median(db)) * strength, -max_db, max_db) / 20)
    return x * (g[:, None] if x.ndim == 2 else g)

def amb_loop(x, L, F, s_range, step=0.5, ride=0.0):
    """Pick the most stationary stretch of length L (+F tail) in a long ambience and make an equal-power loop.
    Cost = loudness wobble inside the window + level / spectral mismatch between loop head and the material after the end."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    n = len(m); Ls, Fs = int(L * SR), int(F * SR)
    best = (1e9, None)
    w = int(0.5 * SR)
    def rms_db(a): return 20 * np.log10(np.sqrt(np.mean(a ** 2)) + 1e-9)
    def spec(a):
        S_ = np.abs(np.fft.rfft(a * np.hanning(len(a))))
        edges = np.geomspace(60, 14000, 30)
        f = np.fft.rfftfreq(len(a), 1 / SR)
        return np.array([20 * np.log10(np.sqrt(np.mean(S_[(f >= edges[i]) & (f < edges[i + 1])] ** 2)) + 1e-9) for i in range(29)])
    for s in np.arange(s_range[0], min(s_range[1], (n - Ls - Fs) / SR), step):
        a = int(s * SR)
        win = m[a:a + Ls + Fs]
        lv = np.array([rms_db(win[i:i + w]) for i in range(0, len(win) - w, w)])
        wobble = lv.max() - np.median(lv)
        head = m[a:a + Fs]; tail = m[a + Ls:a + Ls + Fs]
        lvl = abs(rms_db(head) - rms_db(tail))
        sp = np.mean(np.abs(spec(head) - spec(tail)))
        cost = 1.0 * wobble + 1.5 * lvl + 0.4 * sp
        if cost < best[0]: best = (cost, s)
    s = best[1]; a = int(s * SR)
    Ls = safe_e(0, Ls, n - a - Fs)
    loop = make_loop_xfade(x, a, a + Ls, Fs, power=True)
    if ride: loop = level_ride(loop, strength=ride)
    return loop, dict(src_start=round(s, 2), cost=round(best[0], 2))

# =====================================================================================
#  ENGINES  (mono loops, pitch-shifted by the game; hz = firing/pulse frequency of the loop)
# =====================================================================================
@rec("engine-moped", "engine", [("fs", "140384", "3.4-8.4 s steady cold idle")],
     "cut a steady 5 s idle stretch, high-passed 35 Hz, found the best seamless loop (1.9 s, 36 firings) and cross-faded its seam.", 0.55)
def _engine_moped():
    return engine_loop(lambda: fs(140384), 3.4, 8.4, 1.4, 2.0)

@rec("engine-electric", "engine", [("synth", "synth.py", "engine_electric")],
     "synthesised: 110 Hz motor hum with harmonics + 1.1 kHz / 2.2 kHz whine with slow vibrato; all frequencies are integer multiples of 1/2 s so the 2 s loop is sample-exact.", 0.45)
def _engine_electric():
    T = 2.0; n = int(T * SR); t = np.arange(n) / SR
    r = np.random.default_rng(7)
    f0 = 110.0
    y = np.zeros(n)
    for k, a in [(1, 1.0), (2, 0.55), (3, 0.35), (4, 0.2), (6, 0.12), (8, 0.07)]:
        y += a * np.sin(2 * np.pi * f0 * k * t + 0.3 * k)
    y *= 1 + 0.08 * np.sin(2 * np.pi * 6 * t)                               # 6 cycles / loop
    vib = 1 + 0.012 * np.sin(2 * np.pi * 1.0 * t)
    ph = 2 * np.pi * np.cumsum(1100.0 * vib) / SR
    ph -= ph[-1] * 0                                                         # (phase wrap fixed below)
    whine = np.sin(2 * np.pi * 1100 * t + 12.0 * 0.012 / (2 * np.pi * 1.0) * 1100 / 1100 * (1 - np.cos(2 * np.pi * 1.0 * t)) * 2 * np.pi * 1.0 / 1.0 * 0)
    # closed-form FM phase (periodic): phi = 2*pi*1100*t - (1100*0.012/1.0) * cos(2*pi*1.0*t) + const
    whine = np.sin(2 * np.pi * 1100 * t - 1100 * 0.012 * np.cos(2 * np.pi * 1.0 * t))
    whine2 = np.sin(2 * np.pi * 2200 * t - 2200 * 0.012 * np.cos(2 * np.pi * 1.0 * t) + 1.0)
    nz = r.standard_normal(n)
    # circular (periodic) band-limiting of the noise via FFT so the seam stays clean
    Z = np.fft.rfft(nz); fr = np.fft.rfftfreq(n, 1 / SR)
    Z *= ((fr > 200) & (fr < 3500)) / (1 + (fr / 900) ** 2)
    nz = np.fft.irfft(Z, n); nz /= np.max(np.abs(nz))
    out = 0.55 * y / 2.3 + 0.16 * whine + 0.07 * whine2 + 0.06 * nz
    return out, dict(hz=110.0, pulses=0)

@rec("engine-scooter", "engine", [("fs", "737778", "14.2-29.0 s steady idle")],
     "cut a steady 15 s idle stretch, high-passed 35 Hz, found the best seamless loop (1.25 s, 38 firings), cross-faded its seam.", 0.5)
def _engine_scooter():
    return engine_loop(lambda: fs(737778), 14.2, 29.0, 1.2, 2.0)

@rec("engine-sport", "engine", [("fs", "211668", "8.0-11.4 s steady idle")],
     "cut a steady 3.4 s idle stretch of an inline-four sport bike, high-passed 35 Hz, found the best seamless loop (1.7 s), cross-faded its seam.", 0.5)
def _engine_sport():
    return engine_loop(lambda: fs(211668), 8.0, 11.4, 1.0, 2.0)

@rec("engine-cargo", "engine", [("fs", "658928", "17.2-19.6 s steady chug")],
     "cut a steady low chugging stretch of a tuk-tuk, high-passed 35 Hz, found the best seamless loop (0.68 s, 20 pulses), cross-faded its seam.", 0.55)
def _engine_cargo():
    return engine_loop(lambda: fs(658928), 17.2, 19.9, 0.6, 1.2)


# =====================================================================================
#  AMBIENCE  (stereo loops, equal-power cross-fade of a 3 s pre-roll into the head)
# =====================================================================================
@rec("amb-city", "amb", [("fs", "393701", "most stationary 30 s of 100 s")],
     "picked the calmest 30 s stretch automatically (lowest level wobble + best head/tail match), cross-faded 3 s of the following material into the head (equal-power) for a seamless loop, then flattened slow traffic swells with gentle circular gain riding (max +-4 dB).", 0.35)
def _amb_city():
    x = fs(393701, mono=False)
    return amb_loop(x, 30.0, 3.0, (2, 60), ride=0.7)

@rec("amb-night", "amb", [("fs", "482687", "most stationary 24 s of 70 s")],
     "picked the calmest 24 s stretch and cross-faded a 3 s pre-roll (equal-power) for a seamless loop.", 0.3)
def _amb_night():
    x = fs(482687, mono=False)
    return amb_loop(x, 24.0, 3.0, (1, 40))

@rec("amb-rain", "amb", [("fs", "238431", "most stationary 20 s of 50 s")],
     "picked the most stationary 20 s of an outdoor suburban rain recording and cross-faded 3 s (equal-power) for a seamless loop.", 0.35, lufs=-27.0)
def _amb_rain():
    x = fs(238431, mono=False)
    return amb_loop(x, 20.0, 3.0, (1, 25))

# =====================================================================================
#  MUSIC (stereo loops cut on the beat grid at musically matching points, 0.2 s equal-power seam)
# =====================================================================================
def music_loop(path, s, e, F=0.2, refine=0.05, lpf=500):
    x = decode(path)
    n = len(x)
    s_i, e_i = int(round(s * SR)), int(round(e * SR))
    # refine the loop end by +-refine s: best low-passed waveform agreement between the new head and the material at e
    m = lp(x.mean(axis=1), lpf)
    W = int(2.0 * SR)
    ref = m[s_i:s_i + W]
    best = (-2, 0)
    for d in range(-int(refine * SR), int(refine * SR) + 1, 2):
        c = np.dot(ref, m[e_i + d:e_i + d + W]) / (np.linalg.norm(ref) * np.linalg.norm(m[e_i + d:e_i + d + W]) + 1e-9)
        if c > best[0]: best = (c, d)
    e_i += best[1]
    e_i = safe_e(s_i, e_i, n - int(F * SR))
    loop = make_loop_xfade(x, s_i, e_i, int(F * SR), power=True)
    info = dict(src_start=round(s_i / SR, 3), src_end=round(e_i / SR, 3), align_corr=round(float(best[0]), 3))
    return loop, info

@rec("music-hub", "music", [("oga", "happy-lofi-day", "rhodes.mp3 13.3-110.3 s")],
     "cut a 97 s (160-beat, 99 bpm) loop between two musically matching points of the track, chosen by search: chroma/timbre similarity 0.94 before and after the seam and the smallest spectral jump across the join; end point refined by waveform correlation, 0.2 s equal-power cross-fade at the seam, loudness-normalised.", 0.4)
def _music_hub():
    return music_loop(oga_path("happy-lofi-day", "rhodes.mp3"), 13.33, 110.30)

@rec("music-ride", "music", [("oga", "wednesday-night-funk-fusion", "wednesday_night.wav 68.1-143.6 s")],
     "cut a 75 s (176-beat, 140 bpm) loop between two musically matching points of the track, chosen by search: chroma/timbre similarity 0.93 before and after the seam and almost no spectral/level jump across the join; end point refined by waveform correlation, 0.2 s equal-power cross-fade at the seam, loudness-normalised.", 0.4)
def _music_ride():
    return music_loop(oga_path("wednesday-night-funk-fusion", "wednesday_night.wav"), 68.12, 143.55)


# =====================================================================================
#  ONE-SHOT HELPERS
# =====================================================================================
def env_db(x, win=0.01):
    w = max(1, int(win * SR)); k = np.ones(w) / w
    return 10 * np.log10(np.convolve(x ** 2, k, mode="same") + 1e-12)

def onsets(x, thr_db=-30.0, min_gap=0.15, win=0.01):
    """times (s) where the envelope crosses thr_db upward, at least min_gap apart"""
    e = env_db(x, win) - env_db(x, win).max()
    above = e > thr_db
    idx = np.where(above[1:] & ~above[:-1])[0]
    out = []
    for i in idx:
        if not out or (i - out[-1]) / SR > min_gap: out.append(i)
    return [i / SR for i in out]

def resample(x, ratio):
    """change speed (and pitch) by ratio (>1 = faster/higher)"""
    from scipy.signal import resample_poly
    from fractions import Fraction
    fr = Fraction(ratio).limit_denominator(200)
    return resample_poly(x, fr.denominator, fr.numerator)

def tail_fade(x, ms): return fade(x, in_ms=0.5, out_ms=ms)

def room(x, rt=0.3, wet=0.12, seed=3): return S.reverb(x, rt=rt, wet=wet, seed=seed)

# =====================================================================================
#  UI
# =====================================================================================
@rec("ui-tap", "oneshot", [("synth", "synth.py", "ui_tap")], "synthesised: soft pitched 'tok' (sine glide + second partial + 2 ms click).", 0.7, lufs=-17.0)
def _ui_tap(): return S.ui_tap()

@rec("ui-back", "oneshot", [("synth", "synth.py", "ui_back")], "synthesised: short falling two-partial blip.", 0.7, lufs=-17.0)
def _ui_back(): return S.ui_back()

@rec("ui-open", "oneshot", [("synth", "synth.py", "ui_open")], "synthesised: band-passed noise swoosh rising into a soft marimba 'tok' (panel slide).", 0.7)
def _ui_open(): return S.ui_open()

@rec("ui-error", "oneshot", [("synth", "synth.py", "ui_error")], "synthesised: two low, rounded square-wave 'bonk-bonk' blips (not harsh).", 0.7)
def _ui_error(): return S.ui_error()

@rec("ui-purchase", "oneshot", [("fs", "209578", "0-1.9 s")],
     "trimmed to the ratchet + bell 'ka-ching' (first 1.9 s), fade-out, loudness-normalised.", 0.8, fade_out=300)
def _ui_purchase(): return seg(fs(209578), 0.0, 1.9)

@rec("ui-coins", "oneshot", [("fs", "728430", "densest 1.7 s of a 68 s coin shower"), ("kenney", "rpg-audio", "handleCoins.ogg")],
     "picked the densest 1.7 s of a coin-shower recording, layered the first clinks of Kenney handleCoins, fades in/out.", 0.7, fade_in=40, fade_out=500)
def _ui_coins():
    x = fs(728430)
    L = int(1.7 * SR)
    # window with the most energy that does not start/end on a single big transient
    best = (0, 0)
    step = int(0.1 * SR)
    for a in range(int(1 * SR), len(x) - L, step):
        e = np.sqrt(np.mean(x[a:a + L] ** 2))
        if e > best[0]: best = (e, a)
    a = best[1]
    y = x[a:a + L]
    k = kn("rpg-audio", "handleCoins")
    return place([(y, 0.0), (k, 0.0, -9.0)], n=L)

@rec("ui-levelup", "oneshot", [("synth", "synth.py", "ui_levelup")], "synthesised: C-major marimba run into a bell chord with sparkle and light room.", 0.8, fade_out=200)
def _ui_levelup(): return S.ui_levelup()

@rec("ui-unlock", "oneshot", [("synth", "synth.py", "ui_unlock")], "synthesised: lock 'ka-chunk' followed by a rising bell sparkle.", 0.75, fade_out=200)
def _ui_unlock(): return S.ui_unlock()

@rec("notif-order", "oneshot", [("synth", "synth.py", "notif_order")], "synthesised: two-note (G5, D6) phone-style bell ping.", 0.8, fade_out=200)
def _notif_order(): return S.notif_order()

@rec("countdown-tick", "oneshot", [("synth", "synth.py", "countdown_tick")], "synthesised: woody clock-like tick.", 0.7, lufs=-17.0)
def _countdown_tick(): return S.countdown_tick()

# =====================================================================================
#  RIDE
# =====================================================================================
@rec("horn-moped", "oneshot", [("synth", "synth.py", "horn_moped")], "synthesised: weak, tinny single-tone parp (392 Hz buzzy pulse, band-limited).", 0.7, fade_out=30)
def _horn_moped(): return S.horn_moped()

@rec("horn-scooter", "oneshot", [("fs", "423990", "0-0.62 s")], "trimmed to the two beeps ('beep-beep'), short fade-out.", 0.75, fade_out=40)
def _horn_scooter(): return seg(fs(423990), 0.0, 0.62)

@rec("horn-sport", "oneshot", [("fs", "394655", "0-0.75 s")], "kept the single long two-tone car-horn beep (0.7 s), short fade-out and a little room.", 0.8, fade_out=80)
def _horn_sport():
    return room(seg(fs(394655), 0.0, 0.75), rt=0.25, wet=0.1)

@rec("boost", "oneshot", [("synth", "synth.py", "recipes._boost"), ("fs", "449996", "whoosh layer")],
     "synthesised: rising engine rev (saw, 80->300 Hz, pulsed) + band-passed noise whoosh sweep, layered with a real whoosh.", 0.8, fade_out=250)
def _boost():
    d = 1.15; t = np.arange(int(d * SR)) / SR
    f = 85 * (320 / 85) ** (np.clip(t / 0.75, 0, 1) ** 0.8)
    saw_ = S.bl_saw(f, d, nh=20)
    pulse = 0.55 + 0.45 * (np.sin(2 * np.pi * np.cumsum(f / 3.0) / SR) > 0)
    rev = lp(saw_ * pulse, 2600, order=2)
    rev *= np.minimum(1, t / 0.05) * np.exp(-np.clip(t - 0.85, 0, None) / 0.12)
    nz = S.rng.standard_normal(len(t))
    sw = np.zeros_like(t)
    for c in np.geomspace(350, 4500, 10):
        i = np.argmax(np.geomspace(350, 4500, 10) == c)
        band = bp(nz, c * 0.7, min(c * 1.4, 12000), order=2)
        pos = 0.05 + 0.5 * (i / 9)
        sw += band * np.exp(-((t - pos) ** 2) / (2 * 0.12 ** 2))
    sw *= 1.0
    ww = fs(449996); o = onsets(ww, -25, 0.3); a = max(0, (o[0] if o else 0) - 0.05)
    ww = seg(ww, a, a + 0.9)
    return place([(rev * 0.55, 0.0), (sw * 0.55, 0.0), (ww, 0.05, -2.0)], n=len(t))

@rec("hop", "oneshot", [("fs", "540790", "0-0.7 s")], "used the first 0.7 s of a 'boing' spring (fade-out).", 0.75, fade_out=180)
def _hop(): return seg(fs(540790), 0.0, 0.7)

@rec("land", "oneshot", [("synth", "synth.py", "land"), ("kenney", "impact-sounds", "impactSoft_heavy_001.ogg")],
     "synthesised low thud layered with a low-passed Kenney soft impact.", 0.75, fade_out=60)
def _land():
    k = lp(kn("impact-sounds", "impactSoft_heavy_001"), 900, order=2)
    return place([(S.land(), 0.0), (k, 0.0, -4.0)])

@rec("bump", "oneshot", [("kenney", "impact-sounds", "impactPlate_heavy_000.ogg"), ("kenney", "impact-sounds", "impactMetal_light_001.ogg"), ("synth", "synth.py", "land")],
     "pothole clunk: low-passed Kenney heavy plate impact + synthesised thump + a small metal rattle 90 ms later.", 0.8, fade_out=80)
def _bump():
    a = lp(kn("impact-sounds", "impactPlate_heavy_000"), 3000, order=2)
    b = kn("impact-sounds", "impactMetal_light_001")
    return place([(a, 0.0), (S.land(), 0.0, -3.0), (b, 0.09, -10.0), (resample(b, 0.8), 0.17, -16.0)])

@rec("crash", "oneshot", [("fs", "420356", "0-1.3 s"), ("kenney", "impact-sounds", "impactMetal_heavy_000/003, impactPunch_heavy_000, impactGlass_heavy_000, impactPlate_heavy_001, impactGlass_light_001, impactTin_medium_002"), ("synth", "synth.py", "boing")],
     "cartoon crash: real crash burst (first 1.3 s) layered with Kenney metal/plate/glass impacts, a staggered tinkle of debris and a very quiet spring 'boing' tail; light room.", 0.85, fade_out=300)
def _crash():
    c = seg(fs(420356), 0.0, 1.3)
    parts = [(c, 0.0, -2.0),
             (kn("impact-sounds", "impactMetal_heavy_000"), 0.0, -1.0),
             (kn("impact-sounds", "impactPunch_heavy_000"), 0.0, -3.0),
             (kn("impact-sounds", "impactGlass_heavy_000"), 0.05, -6.0),
             (kn("impact-sounds", "impactPlate_heavy_001"), 0.12, -5.0),
             (kn("impact-sounds", "impactMetal_heavy_003"), 0.2, -8.0),
             (kn("impact-sounds", "impactGlass_light_001"), 0.46, -9.0),
             (kn("impact-sounds", "impactTin_medium_002"), 0.62, -12.0),
             (resample(kn("impact-sounds", "impactMetal_light_003"), 1.2), 0.82, -15.0),
             (S.boing(260, 0.7, 0.5, 14) * 0.5, 0.35, -16.0)]
    return room(place(parts, n=int(1.6 * SR)), rt=0.3, wet=0.1)

@rec("skid", "oneshot", [("fs", "104026", "0.1-1.1 s")], "trimmed to the strongest second of a tyre squeal, fade in/out.", 0.75, fade_in=15, fade_out=250)
def _skid(): return seg(fs(104026), 0.1, 1.1)

@rec("brake", "oneshot", [("fs", "437537", "0.55-1.65 s")], "trimmed the braking/skid-on-gravel noise burst of a bike stop, fade in/out.", 0.7, fade_in=25, fade_out=300)
def _brake(): return seg(fs(437537), 0.55, 1.65)

@rec("pickup-bonus", "oneshot", [("synth", "synth.py", "bell_note"), ("kenney", "casino-audio", "chips-handle-3.ogg")],
     "cash pickup: Kenney chip clink + two quick synthesised bell notes (B5, E6).", 0.8, fade_out=250)
def _pickup_bonus():
    k = kn("casino-audio", "chips-handle-3")
    a = S.bell_note(S.midi(83), 0.55, bright=0.8, tau=0.18)
    b = S.bell_note(S.midi(88), 0.8, bright=0.8, tau=0.25)
    return room(place([(k, 0.0, 0.0), (a * 0.7, 0.03), (b * 0.8, 0.11)], n=int(0.95 * SR)), rt=0.3, wet=0.1)

@rec("splash", "oneshot", [("fs", "207139", "0.38-1.55 s")], "trimmed to the first plop + splash of a puddle recording, fade-out.", 0.75, fade_in=3, fade_out=300)
def _splash(): return seg(fs(207139), 0.38, 1.55)

# =====================================================================================
#  EVENTS
# =====================================================================================
@rec("dog-bark", "oneshot", [("fs", "495658", "three barks re-spaced")],
     "cut the three barks of a recording and re-spaced them closer (0 / 0.43 / 0.92 s) with slight pitch and level changes.", 0.8, fade_out=120)
def _dog_bark():
    x = fs(495658)
    o = onsets(x, -12, 0.5, win=0.01)[:3]
    barks = [seg(x, t - 0.02, t + 0.40) for t in o]
    ratios = [1.0, 0.96, 1.04]; gains = [0.0, -1.5, -0.5]; times = [0.0, 0.43, 0.92]
    parts = []
    for b, r, g, t in zip(barks, ratios, gains, times):
        b = fade(resample(b, r), 2, 120)
        parts.append((b, t, g))
    return place(parts, n=int(1.9 * SR))

@rec("siren-short", "oneshot", [("fs", "536773", "whole 0.9 s")], "kept the two rising 'whoop' sweeps, added a short room tail.", 0.7, fade_out=200)
def _siren_short():
    x = fs(536773)
    x = np.pad(x, (0, int(0.35 * SR)))
    return room(x, rt=0.45, wet=0.18)

@rec("doorbell", "oneshot", [("fs", "442280", "0-2.6 s")], "trimmed to the 'ding-dong' and its ring-out (2.6 s), long fade-out.", 0.8, fade_out=500)
def _doorbell(): return seg(fs(442280), 0.0, 2.6)

@rec("door-open", "oneshot", [("kenney", "rpg-audio", "doorOpen_1.ogg")], "used as is (trimmed, normalised).", 0.8, fade_out=80)
def _door_open(): return kn("rpg-audio", "doorOpen_1")

@rec("crowd-cheer", "oneshot", [("fs", "267249", "0-3.0 s")], "trimmed to the swell and first ring-out of a small crowd cheer, fade-out.", 0.7, fade_in=30, fade_out=500)
def _crowd_cheer(): return seg(fs(267249), 0.0, 3.0)

@rec("qte-good", "oneshot", [("synth", "synth.py", "qte_good")], "synthesised: bright two-note rising marimba+bell 'ding-ding' (C6 -> G6).", 0.8, fade_out=200)
def _qte_good(): return S.qte_good()

@rec("qte-bad", "oneshot", [("synth", "synth.py", "qte_bad")], "synthesised: low falling 'womp' with a soft thud.", 0.8, fade_out=120)
def _qte_bad(): return S.qte_bad()

@rec("event-pop", "oneshot", [("synth", "synth.py", "event_pop")], "synthesised: bubble pop + bright two-note bell sting with sparkle.", 0.8, fade_out=300)
def _event_pop(): return S.event_pop()

@rec("engine-stall", "oneshot", [("fs", "140384", "single firing pulses of the idle, re-timed"), ("kenney", "impact-sounds", "impactMetal_light_000.ogg")],
     "built from real single firing pulses of the moped idle recording: spacing grows (53 -> 420 ms), pitch/level fall, plus a low shudder and a last metallic clunk -- a sputter that dies.", 0.8, fade_out=200)
def _engine_stall():
    x = hp(fs(140384), 35)
    base = x[int(5.0 * SR):int(5.0 * SR) + int(0.4 * SR)]
    # one firing cycle ~ 53 ms: locate strong pulse starts in a 0.4 s stretch and take the cycle after the strongest
    env = lp(np.abs(base), 300)
    pk = int(np.argmax(env[:int(0.1 * SR)]))
    P = int(0.053 * SR)
    pulses = [x[int(5.0 * SR) + pk + i * P: int(5.0 * SR) + pk + (i + 1) * P] for i in range(0, 6)]
    out = np.zeros(int(2.2 * SR))
    r = np.random.default_rng(11)
    t = 0.0; k = 0; gap = 0.055
    while t < 1.75 and k < 24:
        p = pulses[k % len(pulses)].copy()
        ratio = 1.0 - 0.012 * k                       # slower => lower pitch as it dies
        p = resample(p, max(0.6, ratio))
        p = fade(p, 3, 25)
        amp = max(0.12, 1.0 - 0.045 * k) * (0.85 + 0.3 * r.random())
        i = int(t * SR); m = min(len(p), len(out) - i)
        out[i:i + m] += p[:m] * amp
        gap *= 1.0 + 0.10 + 0.012 * k
        t += gap * (0.85 + 0.3 * r.random()); k += 1
    # sub-bass shudder
    tt = np.arange(len(out)) / SR
    shudder = np.sin(2 * np.pi * 38 * tt * np.exp(-tt / 2.0)) * np.exp(-tt / 0.5) * 0.05
    clunk = kn("impact-sounds", "impactMetal_light_000")
    y = out + shudder
    return place([(y, 0.0), (lp(clunk, 2500, order=1), t + 0.10, -8.0)], n=len(out))

@rec("engine-start", "oneshot", [("fs", "574322", "11.4-13.9 s")], "trimmed to the successful kick-start (kick, engine catches, settles into idle), fade-out.", 0.8, fade_in=10, fade_out=350)
def _engine_start(): return seg(fs(574322), 11.4, 13.9)

@rec("tire-pop", "oneshot", [("fs", "243375", "first pop 0-0.8 s")], "trimmed to the first pop and its air-hiss tail, fade-out.", 0.8, fade_out=300)
def _tire_pop():
    x = fs(243375); o = onsets(x, -25, 0.3); a = max(0, (o[0] if o else 0.0) - 0.01)
    return seg(x, a, a + 0.8)

@rec("pump", "oneshot", [("fs", "378359", "one stroke")], "cut one stroke (push whoosh + click) of a bicycle pump, fade in/out.", 0.7, fade_in=15, fade_out=120)
def _pump():
    x = fs(378359); o = onsets(x, -25, 0.5, win=0.02)
    a = max(0, o[1] - 0.05) if len(o) > 1 else 1.0
    return seg(x, a, a + 0.75)

@rec("rain-start", "oneshot", [("fs", "683421", "0-4.5 s")], "trimmed a distant thunder rumble (4.5 s), low-passed at 1.5 kHz so it stays soft, long fade in/out.", 0.7, fade_in=150, fade_out=1200, lufs=-20.0)
def _rain_start(): return lp(seg(fs(683421), 0.0, 4.5), 1500, order=2)

@rec("camera-shutter", "oneshot", [("fs", "376205", "shutter click")], "cut the shutter click out of the recording, short fades.", 0.75, fade_out=40)
def _camera_shutter():
    x = fs(376205); o = onsets(x, -28, 0.1, win=0.005)
    a = max(0, o[0] - 0.02) if o else 0.0
    return seg(x, a, a + 0.32)

@rec("bag-rustle", "oneshot", [("fs", "365520", "1.1 s of crinkling")], "picked the most active 1.1 s of plastic-bag rustling, fades in/out (food bag handover).", 0.7, fade_in=40, fade_out=250, lufs=-18.0)
def _bag_rustle():
    x = fs(365520); L = int(1.1 * SR); best = (0, 0)
    for a in range(0, len(x) - L, int(0.05 * SR)):
        e = np.sqrt(np.mean(x[a:a + L] ** 2))
        if e > best[0]: best = (e, a)
    return x[best[1]:best[1] + L]

@rec("order-complete", "oneshot", [("synth", "synth.py", "order_complete")], "synthesised: upbeat G-major marimba run (G4 B4 D5 G5) into a bell chord.", 0.85, fade_out=250)
def _order_complete(): return S.order_complete()

@rec("order-late", "oneshot", [("fs", "175409", "four wah notes, tightened")],
     "cut the four 'wah-wah-wah-waaah' notes of a muted-trombone recording, trimmed each note to its sustain, butted them closer together and shortened the last note (about 2.7 s total).", 0.75, fade_out=300)
def _order_late():
    x = fs(175409)
    o = onsets(x, -30, 0.5, win=0.03)[:4]
    parts = []; pos = 0.0
    for i, t in enumerate(o):
        L = 0.66 if i < 3 else 0.85
        n = fade(seg(x, t - 0.03, t - 0.03 + L), 6, 60 if i < 3 else 280)
        parts.append((n, pos))
        pos += len(n) / SR - 0.015
    return place(parts, n=int((pos + 0.1) * SR))
