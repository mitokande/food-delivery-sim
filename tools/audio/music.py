"""Music analysis + seamless-loop extraction helpers (beat grid, chroma self-similarity, loop search)."""
import os as _os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")      # BLAS thread spinning is pathologically slow on a busy shared box

import numpy as np
from scipy import signal
from lib import SR, decode, to_mono, lufs, peak_db

def onset_env(x, hop=512, n=1024, sr=SR):
    m = to_mono(x)
    fr = np.lib.stride_tricks.sliding_window_view(m, n)[::hop]
    S = np.abs(np.fft.rfft(fr * np.hanning(n), axis=1))
    S = np.log1p(S * 40)
    flux = np.maximum(0, np.diff(S, axis=0)).sum(axis=1)
    return flux, sr / hop

def beat_grid(x, bpm_range=(70, 180), sr=SR):
    """returns (period_s, phase_s): refined by maximising comb-filter response of the onset envelope."""
    flux, fps = onset_env(x, sr=sr)
    flux = flux - flux.mean()
    best = (-1, None, None)
    t = np.arange(len(flux)) / fps
    # coarse tempo by autocorrelation
    ac = np.fft.irfft(np.abs(np.fft.rfft(flux, 2 * len(flux))) ** 2)[:len(flux)]
    cands = []
    for bpm in np.arange(bpm_range[0], bpm_range[1], 0.05):
        lag = fps * 60 / bpm
        l0 = int(lag); fr_ = lag - l0
        cands.append((ac[l0] * (1 - fr_) + ac[l0 + 1] * fr_, bpm))
    cands.sort(reverse=True)
    top = sorted(set(round(b, 0) for _, b in cands[:12]))
    # refine around the best few with a phase-aware comb score
    bests = []
    for sc0, bpm0 in cands[:6]:
        for bpm in np.arange(bpm0 - 0.6, bpm0 + 0.6, 0.01):
            per = 60.0 / bpm
            for ph in np.arange(0, per, 0.01):
                idx = np.round((np.arange(ph, t[-1], per)) * fps).astype(int)
                idx = idx[idx < len(flux)]
                sc = flux[idx].mean()
                if sc > best[0]: best = (sc, per, ph)
        bests.append(best)
    return best[1], best[2], best[0]

def chroma(x, hop=2048, n=8192, sr=SR):
    m = to_mono(x)
    fr = np.lib.stride_tricks.sliding_window_view(m, n)[::hop]
    S = np.abs(np.fft.rfft(fr * np.hanning(n), axis=1))
    f = np.fft.rfftfreq(n, 1 / sr)
    k = (f > 65) & (f < 2000)
    pc = (np.round(12 * np.log2(f[k] / 440)) + 69).astype(int) % 12
    C = np.zeros((len(fr), 12))
    for i in range(12):
        C[:, i] = (S[:, k][:, pc == i] ** 2).sum(axis=1)
    C = np.sqrt(C)
    C /= (np.linalg.norm(C, axis=1, keepdims=True) + 1e-9)
    return C, sr / hop

def mfcc_like(x, hop=2048, n=4096, sr=SR, bands=24):
    """coarse log-band energies (timbre/level descriptor)"""
    m = to_mono(x)
    fr = np.lib.stride_tricks.sliding_window_view(m, n)[::hop]
    S = np.abs(np.fft.rfft(fr * np.hanning(n), axis=1)) ** 2
    f = np.fft.rfftfreq(n, 1 / sr)
    edges = np.geomspace(60, 12000, bands + 1)
    B = np.stack([S[:, (f >= edges[i]) & (f < edges[i + 1])].sum(axis=1) for i in range(bands)], axis=1)
    return 10 * np.log10(B + 1e-9)


def features(x, sr=SR, hop=2048):
    C, fps = chroma(x, hop=hop)
    B = mfcc_like(x, hop=hop)
    m = min(len(C), len(B)); C, B = C[:m], B[:m]
    B = B - B.mean(axis=0)
    B = B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-9)
    F = np.concatenate([C, B], axis=1) / np.sqrt(2)
    return F, fps

def seq_sim(F, a, b, n):
    """mean cosine similarity between F[a:a+n] and F[b:b+n] (frames); NaN if out of range"""
    if a < 0 or b < 0 or a + n > len(F) or b + n > len(F): return np.nan
    A = F[a:a + n]; Bm = F[b:b + n]
    return float(np.mean(np.sum(A * Bm, axis=1)))

def search_loops(x, per, ph, lmin, lmax, start_max=40.0, W=8.0, beats_per_unit=4, top=8, sr=SR, hop=2048):
    """Search loop (s,e) pairs on the beat grid. Returns list of dicts sorted by score."""
    F, fps = features(x, sr, hop)
    n = int(W * fps)
    dur = len(x) / sr
    unit = per * beats_per_unit
    res = []
    s_list = np.arange(ph, min(start_max, dur - lmin), per * 1.0)
    for s in s_list:
        for L_units in range(int(lmin / unit), int(lmax / unit) + 1):
            L = L_units * unit
            e = s + L
            if e + 2.0 > dur: continue
            nh = min(n, int((dur - e - 0.05) * fps))
            if nh < n * 0.6: continue
            sh = seq_sim(F, int(round(s * fps)), int(round(e * fps)), nh)
            st = seq_sim(F, int(round((s - W) * fps)), int(round((e - W) * fps)), n)
            if np.isnan(sh): continue
            score = sh if np.isnan(st) else 0.65 * sh + 0.35 * st
            res.append(dict(s=float(s), e=float(e), L=float(L), head=sh, tail=(None if np.isnan(st) else st), score=float(score)))
    res.sort(key=lambda d: -d['score'])
    return res[:top]
